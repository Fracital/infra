#!/usr/bin/env python3
"""Classifying SOCKS5 front for the edge Wisp server.

holyWisp on this edge dials 127.0.0.1:1081 (no auth) for every TCP stream. For
each CONNECT we classify the destination hostname by asking two Cloudflare
Gateway DoH locations in parallel and act on the verdict:

  adult  -> refuse (SOCKS "connection not allowed by ruleset")
  shady  -> forward to amph's authenticated SOCKS5 relay (Mullvad egress)
  clean  -> connect directly from this edge
  error  -> fail open: treat as clean

Verdicts are cached per hostname for the Gateway-capped TTL. The three DoH
subdomains and the amph relay credentials come from /etc/abulxt/edge-router.json.

UDP streams never come here: SOCKS5 here is CONNECT only, and holyWisp sends
them itself, straight from the edge (`proxy-udp = direct`). The one thing it
asks first is DNS, so with "dns_port" in the config this process is also
holyWisp's first `dns-server` (the name gate, below): a shady name resolves to
the relay's address instead of its own, which the holyWisp unit may not send to
(IPAddressDeny), so a UDP stream to it closes on its first datagram while the
TCP stream, which reaches us by name, still takes the relay.

One family per name. A clean connect tries the addresses in resolver order
(IPv6 first on a dual-stack edge), one after the other, and gives IPv6 only
V6_WAIT seconds when the name also has IPv4, so an IPv6 address that neither
answers nor refuses does not cost the stream. A name whose connect landed on
IPv4 is pinned: the gate answers its AAAA question with no records, so
holyWisp's UDP for it goes over IPv4 as well, and our own connects go to IPv4
first, until a connect lands on IPv6 again (tried once the pin is PIN_RETRY old).

Public addresses only. holyWisp checks a stream's destination, then hands us the
*hostname* (we classify by name), and a name can answer holyWisp with a public
address and our lookup a moment later with 127.0.0.1 or 10.x (DNS rebinding).
So a clean connect dials only addresses from our own lookup that are public
unicast, and a literal IP is held to the same test; a destination with no public
address is refused. A shady stream is not checked here: the relay hands it to a
Mullvad exit by name, which resolves it on Mullvad's network, not ours.

Cloudflare WARP (optional, role edge_warp), in one of two modes; a config that
names both is refused. A clean stream, by name or literal IP, leaves through
WARP instead of from this edge's address. Everything above still happens here
first: the lookup, the public-address test and the family order. WARP is handed
the address we picked, never the name. Shady streams, the DoH lookups (the
Gateway locations are locked to the edge networks) never touch WARP.

  proxy mode ("warp_proxy"): through WARP's local SOCKS5 proxy (`warp-cli mode
  proxy`). With "warp_fallback_direct" true, a proxy that refuses or is down
  sends the stream out directly, logged at most once a minute; with it false,
  the stream fails.

  kernel mode ("warp_tunnels"): kernel WireGuard interfaces warp0..N, one WARP
  identity each, and policy routing that sends a socket carrying a tunnel's
  SO_MARK out through it (the unit needs CAP_NET_ADMIN). A clean connect is
  marked for one tunnel, picked by rendezvous hashing of the stream's site
  (approximate registrable domain, or the literal IP) over the tunnels healthy
  for its family, so a site keeps its exit while that tunnel lives and gets it
  back when it recovers. Every tunnel is probed per family each PROBE_INTERVAL
  (HTTPS /cdn-cgi/trace through its mark, healthy on warp=on or warp=plus):
  PROBE_DEAD_AFTER failures in a row take it out, one success puts it back. No
  healthy tunnel for the family: out directly with "warp_fallback_direct"
  (logged at most once a minute), else the stream fails. A connect that fails
  through a healthy tunnel fails as a direct one would; the probes alone judge
  the tunnel. With "warp_slow_targets" (host names), every SLOW_INTERVAL each
  tunnel's TLS handshake with each of them is timed too, and a tunnel far
  slower than the others for one host (slow_verdict) SLOW_ROUNDS rounds in a
  row is taken out as a dead one is, until SLOW_CLEAR_ROUNDS find it fast; never
  more than half of a family's tunnels, so this alone never empties one.
  After every probe round the tunnels up per family go to
  "warp_state" (default WARP_STATE_PATH; "" writes nothing), atomically, as
  {"v4": [{"name", "mark"}...], "v6": [...]}. A holyWisp with udp-warp-state
  reads it and marks a UDP stream for the tunnel this router would pick for
  its site, so a site's UDP and TCP leave from the same tunnel. The test
  vectors (warp_vectors.json, from holyWisp's tests/gen_warp_vectors.py) pin
  site_key, rendezvous_score and pick so the two can't drift apart.
  Per client: a holyWisp with proxy-client-key offers SOCKS5 method 2 and sends
  its client's key (16 hex digits, BLAKE2b-64 of a per-box secret and the
  client's address, an IPv6 client by its /64) as the RFC 1929 username. The
  tunnel is then picked by "<key>/<site>", so one client keeps one exit per site
  and a busy site spreads over the tunnels by client. A malformed username is
  ignored (the site alone, as without a key); the password is ignored.
Python 3.9 compatible (santaclara).
"""

import asyncio
import collections
import hashlib
import ipaddress
import json
import logging
import os
import random
import re
import socket
import ssl
import struct
import time
from pathlib import Path

CONFIG_PATH = Path("/etc/abulxt/edge-router.json")
LISTEN_HOST = "127.0.0.1"
LISTEN_PORT = 1081

VERDICT_TTL = 300.0          # seconds; matches Gateway max_ttl override
NEGATIVE_TTL = 30.0          # cache an errored lookup briefly (fail open)
DOH_TIMEOUT = 2.5            # per-lookup; a slow classifier must not stall the stream
CONNECT_TIMEOUT = 10.0       # a whole clean connect, every address included
V6_WAIT = 3.0                # of which IPv6 gets this much while IPv4 addresses are left to try
RELAY_CONNECT_TIMEOUT = 10.0
MAX_CACHE = 50000
PIN_RETRY = 300.0            # a pinned name's connects go to IPv4 first for this long, then IPv6 is tried again
PIN_TTL = 900.0              # a pin nothing refreshed is gone after this (the gate shows AAAA again)
MAX_PINS = 20000             # oldest out first
# Name gate. holyWisp waits dns-timeout-ms (3 s) for each answer, then asks its
# next dns-server, so the two waits below must add up to less than that.
GATE_VERDICT_TIMEOUT = 1.0   # no verdict by then: answer as clean (fail open)
GATE_UPSTREAM_TIMEOUT = 0.9  # per upstream resolver
GATE_SHADY_TTL = 60          # seconds holyWisp may cache a shady answer
# WARP kernel mode.
SO_MARK = getattr(socket, "SO_MARK", 36)
PROBE_TIMEOUT = 5.0          # one tunnel health probe, connect to last byte
PROBE_INTERVAL = 15.0
PROBE_DEAD_AFTER = 2         # consecutive failed probes before a tunnel that was up goes down
PROBE_READ_MAX = 8192        # bytes of a probe response read at most
# Slow paths: a tunnel can pass its probe and still be slow to some sites. On 2026-11-19
# warp2's TLS to OVH answered 19.7 s late every time while warp1, warp3 and the box's own address
# took 16 to 190 ms. Every SLOW_INTERVAL each tunnel's TLS handshake with each "warp_slow_targets"
# host is timed, per family, and compared with the other tunnels' for the same host.
SLOW_INTERVAL = 120.0
SLOW_TIMEOUT = 8.0           # one handshake; not done by then is slow, when another tunnel did it
SLOW_FLOOR = 1.0             # seconds: a handshake faster than this is never slow
SLOW_FACTOR = 4.0            # times the fastest other tunnel's handshake with that host
SLOW_ROUNDS = 2              # rounds in a row slow for some host before a tunnel is taken out
SLOW_CLEAR_ROUNDS = 2        # rounds in a row with no host slow before it is used again
# holyWisp reads this to mark its own UDP the same way (udp-warp-state). It treats a file older
# than 60 s as stale, so it is rewritten after every probe round, not only on a change.
WARP_STATE_PATH = "/run/abulxt-edge-router/warp.json"

ADULT, SHADY, CLEAN = "adult", "shady", "clean"

log = logging.getLogger("edge-router")


def load_config():
    cfg = json.loads(CONFIG_PATH.read_text())
    for key in ("doh_adult", "doh_shady", "doh_plain", "relay_host", "relay_port", "relay_user", "relay_pass"):
        if key not in cfg:
            raise SystemExit("edge-router.json missing %r" % key)
    cfg["warp"] = warp_endpoint(cfg.get("warp_proxy"))
    cfg["warp_bypass"] = warp_bypass(cfg.get("warp_bypass"))
    tunnels = warp_tunnels(cfg.get("warp_tunnels"))
    if tunnels and cfg["warp"]:
        raise SystemExit("edge-router.json: warp_proxy and warp_tunnels are two WARP modes; set one, not both")
    cfg["warp_kernel"] = None
    if tunnels:
        cfg["warp_kernel"] = WarpTunnels(
            tunnels,
            probe_target(cfg.get("warp_probe_v4", "1.1.1.1"), 4, "warp_probe_v4"),
            probe_target(cfg.get("warp_probe_v6", "2606:4700:4700::1111"), 6, "warp_probe_v6"),
            state_path=cfg.get("warp_state", WARP_STATE_PATH) or None,
            slow_targets=slow_targets(cfg.get("warp_slow_targets")))
    return cfg


def warp_bypass(value):
    """edge-router.json "warp_bypass": names whose clean TCP never goes through WARP.

    The patterns are holyWisp's warp-bypass-host (hw_hostlist): "name" is the name itself,
    "*.name" or ".name" its subdomains (not the name). Returns (exact names, suffixes). The two
    lists must be equal, or a site's TCP (dialled here) and UDP (by holyWisp) leave from two
    addresses; both are rendered from edge_warp_bypass_hosts.
    """
    exact, suffixes = set(), []
    for entry in value or []:
        if not isinstance(entry, str):
            raise SystemExit("edge-router.json: warp_bypass entries must be strings")
        name = entry.strip().lower().rstrip(".")
        if name.startswith("*."):
            name = name[1:]
        if "*" in name:
            raise SystemExit("edge-router.json: warp_bypass pattern %r: only a leading \"*.\" is a wildcard" % entry)
        if name.startswith("."):
            if len(name) < 2:
                raise SystemExit("edge-router.json: empty warp_bypass pattern %r" % entry)
            suffixes.append(name)
        elif name:
            exact.add(name)
        else:
            raise SystemExit("edge-router.json: empty warp_bypass pattern %r" % entry)
    return frozenset(exact), tuple(suffixes)


def bypasses_warp(cfg, host):
    """Whether a name is kept off WARP (warp_bypass). An IP literal never is."""
    exact, suffixes = cfg.get("warp_bypass") or (frozenset(), ())
    if not exact and not suffixes:
        return False
    try:
        ipaddress.ip_address(host.strip("[]"))
        return False
    except ValueError:
        pass
    name = host.lower().rstrip(".")
    if name in exact:
        return True
    return bool(suffixes) and name.endswith(suffixes)


def warp_endpoint(text):
    """"127.0.0.1:40000" -> ("127.0.0.1", 40000); empty or absent -> None (no WARP)."""
    if not text:
        return None
    host, sep, port = str(text).rpartition(":")
    try:
        ok = bool(sep) and ipaddress.ip_address(host.strip("[]")).is_loopback and 0 < int(port) < 65536
    except ValueError:
        ok = False
    if not ok:
        raise SystemExit("edge-router.json: warp_proxy must be a loopback host:port, not %r" % text)
    return host.strip("[]"), int(port)


WarpTunnel = collections.namedtuple("WarpTunnel", "name mark")
TUNNEL_NAME = re.compile(r"[A-Za-z0-9_.-]{1,15}")     # fullmatch, as holyWisp checks it


def warp_tunnels(value):
    """[{"name": "warp0", "mark": 30465}, ...] -> [WarpTunnel]; empty or absent -> [] (no kernel mode)."""
    if not value:
        return []
    if not isinstance(value, list):
        raise SystemExit("edge-router.json: warp_tunnels must be a list, not %r" % (value,))
    out, names, marks = [], set(), set()
    for entry in value:
        name = entry.get("name") if isinstance(entry, dict) else None
        mark = entry.get("mark") if isinstance(entry, dict) else None
        if not isinstance(name, str) or not TUNNEL_NAME.fullmatch(name):
            raise SystemExit("edge-router.json: warp_tunnels entry needs an interface name "
                             "(1-15 of A-Z a-z 0-9 _ . -), not %r" % (entry,))
        if isinstance(mark, bool) or not isinstance(mark, int) or not 0 < mark <= 0xFFFFFFFF:
            raise SystemExit("edge-router.json: warp_tunnels mark must be an integer 1..0xFFFFFFFF, not %r"
                             % (entry,))
        if name in names:
            raise SystemExit("edge-router.json: warp_tunnels names %r twice" % name)
        if mark in marks:
            raise SystemExit("edge-router.json: warp_tunnels mark %#x is used twice" % mark)
        names.add(name)
        marks.add(mark)
        out.append(WarpTunnel(name, mark))
    return out


HOSTNAME_RE = re.compile(r"^(?=.{1,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$")


def slow_targets(value):
    """edge-router.json "warp_slow_targets": host names whose TLS handshake times compare the tunnels."""
    if value is None:
        return []
    if not isinstance(value, list):
        raise SystemExit("edge-router.json: warp_slow_targets must be a list of host names")
    out = []
    for entry in value:
        if not isinstance(entry, str) or not HOSTNAME_RE.match(entry.lower()):
            raise SystemExit("edge-router.json: warp_slow_targets entry %r is not a host name" % (entry,))
        if entry.lower() not in out:
            out.append(entry.lower())
    return out


def slow_verdict(times):
    """{tunnel: seconds or None (no handshake within SLOW_TIMEOUT)} for one host -> the slow tunnels.

    A tunnel is slow when it took more than SLOW_FLOOR and more than SLOW_FACTOR times the fastest
    other tunnel, or did not finish while another did. The fastest, not the median: two slow
    tunnels of three would each count the other in a median and hide each other. With no other to
    compare, none is.
    """
    slow = set()
    for name, t in times.items():
        others = [v for n, v in times.items() if n != name and v is not None]
        if not others:
            continue
        if t is None or (t > SLOW_FLOOR and t > SLOW_FACTOR * min(others)):
            slow.add(name)
    return slow


def probe_target(text, version, key):
    """A tunnel probe target must be an IP literal of its family (its certificate names the IP)."""
    try:
        ok = ipaddress.ip_address(str(text)).version == version
    except ValueError:
        ok = False
    if not ok:
        raise SystemExit("edge-router.json: %s must be an IPv%d address, not %r" % (key, version, text))
    return str(ipaddress.ip_address(text))


# ---------------------------------------------------------------- DoH client

def dns_wire(name):
    # SOCKS hostnames are already A-labels; non-ASCII can't be classified, so
    # fall back to a lossy encode rather than failing the stream.
    qn = b"".join(bytes([len(p)]) + p.encode("ascii", "replace")[:63] for p in name.rstrip(".").split(".")) + b"\x00"
    return struct.pack("!HHHHHH", 0, 0x0100, 1, 0, 0, 0) + qn + struct.pack("!HH", 1, 1)


def dns_blocked(resp):
    """True if Gateway answered A 0.0.0.0 (policy block). None if unusable."""
    if len(resp) < 12:
        return None
    rcode = resp[3] & 0x0F
    if rcode == 5:            # REFUSED: this edge is not on the location allowlist
        return None
    if rcode == 3:            # NXDOMAIN is a real answer, not a block
        return False
    if rcode != 0:
        return None
    qd, an = struct.unpack("!HH", resp[4:8])
    off = 12
    for _ in range(qd):
        while resp[off] != 0:
            off += resp[off] + 1
        off += 5
    ips = []
    for _ in range(an):
        while True:
            b = resp[off]
            if b & 0xC0 == 0xC0:
                off += 2
                break
            if b == 0:
                off += 1
                break
            off += b + 1
        rtype, _cls, _ttl, rdlen = struct.unpack("!HHIH", resp[off:off + 10])
        off += 10
        if rtype == 1 and rdlen == 4:
            ips.append(resp[off:off + 4])
        off += rdlen
    if not ips:
        return False
    return all(ip == b"\x00\x00\x00\x00" for ip in ips)


class DohClient:
    """One persistent-ish HTTPS/1.1 connection per Gateway location."""

    def __init__(self, subdomain):
        self.host = "%s.cloudflare-gateway.com" % subdomain
        self.ctx = ssl.create_default_context()
        self.lock = asyncio.Lock()
        self.reader = None
        self.writer = None

    async def _open(self):
        self.reader, self.writer = await asyncio.wait_for(
            asyncio.open_connection(self.host, 443, ssl=self.ctx, server_hostname=self.host), DOH_TIMEOUT)

    async def _close(self):
        if self.writer is not None:
            self.writer.close()
            self.reader = self.writer = None

    async def query(self, name):
        body = dns_wire(name)
        req = (
            "POST /dns-query HTTP/1.1\r\nHost: %s\r\nContent-Type: application/dns-message\r\n"
            "Accept: application/dns-message\r\nContent-Length: %d\r\nConnection: keep-alive\r\n\r\n"
            % (self.host, len(body))
        ).encode() + body
        async with self.lock:
            for attempt in range(2):
                try:
                    if self.writer is None:
                        await self._open()
                    self.writer.write(req)
                    await self.writer.drain()
                    head = await asyncio.wait_for(self.reader.readuntil(b"\r\n\r\n"), DOH_TIMEOUT)
                    status = int(head.split(b" ", 2)[1])
                    clen = 0
                    for line in head.split(b"\r\n"):
                        if line.lower().startswith(b"content-length:"):
                            clen = int(line.split(b":", 1)[1])
                    payload = await asyncio.wait_for(self.reader.readexactly(clen), DOH_TIMEOUT) if clen else b""
                    if status != 200:
                        return None
                    return payload
                except (OSError, asyncio.TimeoutError, asyncio.IncompleteReadError, ValueError, IndexError):
                    await self._close()
                    if attempt == 1:
                        return None


class Classifier:
    def __init__(self, cfg):
        self.adult = DohClient(cfg["doh_adult"])
        self.shady = DohClient(cfg["doh_shady"])
        self.plain = DohClient(cfg["doh_plain"])
        self.cache = {}          # host -> (verdict, expires_at)
        self.inflight = {}       # host -> Future

    async def verdict(self, host):
        host = host.lower().rstrip(".")
        now = time.monotonic()
        hit = self.cache.get(host)
        if hit and hit[1] > now:
            return hit[0]
        fut = self.inflight.get(host)
        if fut is None:
            fut = asyncio.ensure_future(self._lookup(host))
            self.inflight[host] = fut
            fut.add_done_callback(lambda _f, h=host: self.inflight.pop(h, None))
        return await fut

    async def _lookup(self, host):
        a, s = await asyncio.gather(self.adult.query(host), self.shady.query(host))
        ba, bs = dns_blocked(a) if a else None, dns_blocked(s) if s else None
        if ba is None and bs is None:
            verdict, ttl = CLEAN, NEGATIVE_TTL      # fail open
            log.warning("classifier unavailable for %s; fail-open", host)
        elif ba:
            verdict, ttl = ADULT, VERDICT_TTL       # adult wins over shady
        elif bs:
            verdict, ttl = SHADY, VERDICT_TTL
        else:
            verdict, ttl = CLEAN, VERDICT_TTL
        if len(self.cache) >= MAX_CACHE:
            self.cache.clear()
        self.cache[host] = (verdict, time.monotonic() + ttl)
        return verdict


# ---------------------------------------------------------------- one family per name

class FamilyPins:
    """Names whose last clean TCP connect landed on IPv4, oldest first."""

    def __init__(self):
        self.pins = {}           # host -> [pinned at, next IPv6 try due], time.monotonic()

    @staticmethod
    def key(host):
        return host.lower().rstrip(".")

    def hides_v6(self, host):
        """For the gate: answer this name's AAAA question with no records."""
        host = self.key(host)
        pin = self.pins.get(host)
        if pin is not None and time.monotonic() - pin[0] >= PIN_TTL:
            del self.pins[host]
            pin = None
        return pin is not None

    def v4_first(self, host):
        """For our own connects. When the IPv6 try is due, one connect gets the resolver's order back."""
        pin = self.pins.get(self.key(host))
        if pin is None:
            return False
        now = time.monotonic()
        if now < pin[1]:
            return True
        pin[1] = now + CONNECT_TIMEOUT       # the connects that come while this one tries stay on IPv4
        return False

    def landed(self, host, family, tried_v6, fell_back):
        """A clean connect succeeded. tried_v6: it used the resolver's order, not ours."""
        host = self.key(host)
        was = self.pins.pop(host, None)
        if family != socket.AF_INET:
            if was is not None:
                log.info("%s: connect landed on IPv6 again; unpinned", host)
            return
        if was is None and fell_back:        # a name with no usable IPv6 at all is pinned quietly
            log.info("%s: IPv6 failed, connect landed on IPv4; pinned to IPv4 (UDP follows)", host)
        while len(self.pins) >= MAX_PINS:
            del self.pins[next(iter(self.pins))]
        now = time.monotonic()
        retry = now + PIN_RETRY if was is None or tried_v6 else was[1]
        self.pins[host] = [now, retry]       # re-inserted, so the dict stays oldest first


NAT64 = ipaddress.ip_network("64:ff9b::/96")


class NoPublicAddress(Exception):
    """The destination resolved, but to nothing a stream may go to."""


def public_address(text):
    """Whether `text` is a public unicast address, i.e. one a stream may go to.

    IPv4 carried inside IPv6 (mapped, 6to4, NAT64) is judged as the IPv4 it
    carries; Teredo and anything that does not parse are refused.
    """
    try:
        ip = ipaddress.ip_address(text.split("%", 1)[0])
    except ValueError:
        return False
    if ip.version == 6:
        if ip.teredo is not None:
            return False
        inner = ip.ipv4_mapped or ip.sixtofour
        if inner is None and ip in NAT64:
            inner = ipaddress.IPv4Address(int(ip) & 0xFFFFFFFF)
        if inner is not None:
            ip = inner
    if (ip.is_private or ip.is_loopback or ip.is_link_local or ip.is_multicast
            or ip.is_reserved or ip.is_unspecified):
        return False
    return ip.is_global


# ---------------------------------------------------------------- WARP kernel mode

FAMILY_NAME = {socket.AF_INET: "IPv4", socket.AF_INET6: "IPv6"}
# Second-level labels under a two-letter TLD that are a public suffix of their
# own (example.co.uk, example.com.au). An approximation of the PSL, no more.
SLD_SUFFIXES = frozenset(("co", "com", "net", "org", "gov", "edu", "ac", "or", "ne", "go", "gob", "nic",
                          "mil", "ltd", "plc"))


def site_key(host):
    """The approximate registrable domain of a name: what picks its WARP tunnel.

    holyWisp passes no client identity, so "one client keeps one exit" is
    approximated per site: every name of a site leaves through one tunnel, which
    keeps its cookies and challenges (cf_clearance is IP-bound and set on the
    parent domain) on one exit address. Per-client stickiness would need
    holyWisp to pass the client in the SOCKS username, a holyWisp change.
    """
    labels = host.lower().rstrip(".").split(".")
    if len(labels) <= 2:
        return ".".join(labels)
    if len(labels[-1]) == 2 and labels[-2] in SLD_SUFFIXES:
        return ".".join(labels[-3:])
    return ".".join(labels[-2:])


def rendezvous_score(key, name):
    """Stable across restarts and hosts, unlike hash()."""
    return int.from_bytes(hashlib.blake2b((key + "\0" + name).encode(), digest_size=8).digest(), "big")


async def open_marked(ip, port, family, mark, **kw):
    """A TCP stream to ip:port from a socket carrying SO_MARK `mark` (kw goes to open_connection, e.g. ssl)."""
    loop = asyncio.get_event_loop()
    sock = socket.socket(family, socket.SOCK_STREAM)
    try:
        sock.setblocking(False)
        sock.setsockopt(socket.SOL_SOCKET, SO_MARK, mark)
        await loop.sock_connect(sock, (ip, port))
        return await asyncio.open_connection(sock=sock, **kw)
    except BaseException:                # cancellation by wait_for included
        sock.close()
        raise


def trace_says_warp(data):
    """Whether a /cdn-cgi/trace response says the request came in over WARP."""
    return any(line.strip() in (b"warp=on", b"warp=plus") for line in data.split(b"\n"))


class WarpTunnels:
    """The kernel WARP tunnels and their health, per address family."""

    FAMILIES = (socket.AF_INET, socket.AF_INET6)

    def __init__(self, tunnels, probe_v4="1.1.1.1", probe_v6="2606:4700:4700::1111", state_path=None,
                 slow_targets=()):
        self.tunnels = list(tunnels)
        self.slow_targets = list(slow_targets)
        self.slow_rounds = {}    # (name, family) -> rounds in a row found slow for some host
        self.clean_rounds = {}   # (name, family) -> rounds in a row found slow for none
        self.slow_out = set()    # (name, family) taken out for it: up, and not used
        self.state_path = state_path     # warp.json for holyWisp; None writes nothing
        self._state_err_logged = 0.0
        self.targets = {socket.AF_INET: probe_v4, socket.AF_INET6: probe_v6}
        self.up = {}             # (name, family) -> bool; absent until first probed, and counts as down
        self.fails = {}          # (name, family) -> consecutive failed probes
        self._ctx = None

    def healthy(self, family):
        up = [t for t in self.tunnels if self.up.get((t.name, family))]
        fast = [t for t in up if (t.name, family) not in self.slow_out]
        return fast or up        # a slow tunnel is still better than none

    def pick(self, key, family):
        """Rendezvous hashing: the healthy tunnel scoring highest for key, or None.

        A key keeps its tunnel while that tunnel is healthy; only a dead tunnel's
        keys move, and they come back when it recovers.
        """
        healthy = self.healthy(family)
        if not healthy:
            return None
        return max(healthy, key=lambda t: (rendezvous_score(key, t.name), t.name))

    def record(self, name, family, ok):
        """One probe result. The first sets the state; then down after PROBE_DEAD_AFTER failures, up after one success."""
        k = (name, family)
        was = self.up.get(k)
        self.fails[k] = 0 if ok else self.fails.get(k, 0) + 1
        if was is None or ok:
            now = ok
        else:
            now = was and self.fails[k] < PROBE_DEAD_AFTER
        self.up[k] = now
        if was is not None and now != was:
            if now:
                log.info("WARP tunnel %s is up again for %s", name, FAMILY_NAME[family])
            else:
                log.warning("WARP tunnel %s is down for %s (%d failed probes); its sites move to the others",
                            name, FAMILY_NAME[family], self.fails[k])

    def describe(self, tunnel):
        """"warp0 IPv4 up, IPv6 down"."""
        return "%s %s" % (tunnel.name, ", ".join(
            "%s %s" % (FAMILY_NAME[f], "up" if self.up.get((tunnel.name, f)) else "down") for f in self.FAMILIES))

    async def probe(self, tunnel, family):
        """GET /cdn-cgi/trace over HTTPS through the tunnel's mark; True iff it says warp=on/plus."""
        try:
            return await asyncio.wait_for(self._probe(tunnel, family), PROBE_TIMEOUT)
        except Exception:
            return False

    async def _probe(self, tunnel, family):
        if self._ctx is None:
            self._ctx = ssl.create_default_context()
        target = self.targets[family]
        host = "[%s]" % target if family == socket.AF_INET6 else target
        writer = None
        try:
            reader, writer = await open_marked(target, 443, family, tunnel.mark,
                                               ssl=self._ctx, server_hostname=target)
            writer.write(("GET /cdn-cgi/trace HTTP/1.1\r\nHost: %s\r\nUser-Agent: edge-router\r\n"
                          "Connection: close\r\n\r\n" % host).encode())
            await writer.drain()
            data = b""
            while len(data) < PROBE_READ_MAX:
                chunk = await reader.read(PROBE_READ_MAX - len(data))
                if not chunk:
                    break
                data += chunk
            return trace_says_warp(data)
        finally:
            if writer is not None:
                writer.close()

    async def probe_all(self):
        """Every tunnel, both families, at once. Each probe is bounded by PROBE_TIMEOUT."""
        jobs = [(t, f) for t in self.tunnels for f in self.FAMILIES]
        results = await asyncio.gather(*(self.probe(t, f) for t, f in jobs), return_exceptions=True)
        for (t, f), ok in zip(jobs, results):
            self.record(t.name, f, ok is True)
        self.write_state()

    def slow_round(self, results):
        """One round of handshake times: {family: {host: {tunnel name: seconds or None}}}.

        A tunnel slow for some host SLOW_ROUNDS rounds in a row is taken out of healthy();
        SLOW_CLEAR_ROUNDS rounds in a row with no host slow put it back, so a tunnel that is slow
        on and off stays out rather than moving its sites' exit address every round. At most half
        of a family's tunnels that are up are out for this at once, so it never empties a family:
        those already out keep their place, then the longest streaks, so two slow tunnels never
        trade places.
        """
        for family, hosts in results.items():
            slow_now = set()
            judged = set()
            for times in hosts.values():
                judged.update(times)
                slow_now |= slow_verdict(times)
            for name in judged:
                k = (name, family)
                slow = name in slow_now
                self.slow_rounds[k] = self.slow_rounds.get(k, 0) + 1 if slow else 0
                self.clean_rounds[k] = 0 if slow else self.clean_rounds.get(k, 0) + 1
            up = [t.name for t in self.tunnels if self.up.get((t.name, family))]

            def keeps_out(n):
                k = (n, family)
                if k in self.slow_out:
                    return self.clean_rounds.get(k, 0) < SLOW_CLEAR_ROUNDS
                return self.slow_rounds.get(k, 0) >= SLOW_ROUNDS

            want = sorted((n for n in up if keeps_out(n)),
                          key=lambda n: ((n, family) not in self.slow_out, -self.slow_rounds.get((n, family), 0), n))
            want = want[:len(up) // 2]
            for t in self.tunnels:
                k = (t.name, family)
                if t.name in want and k not in self.slow_out:
                    self.slow_out.add(k)
                    log.warning("WARP tunnel %s is slow for %s (%s); its sites move to the others",
                                t.name, FAMILY_NAME[family], self._slow_detail(hosts, t.name))
                elif t.name not in want and k in self.slow_out:
                    self.slow_out.discard(k)
                    if t.name in up:     # a tunnel that went down meanwhile is the probe's to report
                        why = "fast again" if self.slow_rounds.get(k, 0) == 0 else "the others are out or slow too"
                        log.info("WARP tunnel %s is back in use for %s (%s)", t.name, FAMILY_NAME[family], why)

    @staticmethod
    def _slow_detail(hosts, name):
        parts = []
        for host, times in sorted(hosts.items()):
            if name in slow_verdict(times):
                t = times[name]
                parts.append("%s %s against %s" % (host, "no handshake" if t is None else "%.1f s" % t,
                             "/".join("%.2f" % v for n, v in sorted(times.items()) if n != name and v is not None)))
        return "; ".join(parts) or "slow streak"

    async def handshake_time(self, tunnel, family, host, ip):
        """Seconds for a TCP connect and TLS handshake with host at ip through the tunnel, or None."""
        if self._ctx is None:
            self._ctx = ssl.create_default_context()
        loop = asyncio.get_event_loop()
        start = loop.time()
        writer = None
        try:
            _reader, writer = await asyncio.wait_for(
                open_marked(ip, 443, family, tunnel.mark, ssl=self._ctx, server_hostname=host), SLOW_TIMEOUT)
            return loop.time() - start
        except Exception:
            return None
        finally:
            if writer is not None:
                writer.close()

    async def slow_probe_all(self):
        """Every host, both families, through every tunnel that is up, at once; then slow_round."""
        loop = asyncio.get_event_loop()
        results = {}
        for family in self.FAMILIES:
            up = [t for t in self.tunnels if self.up.get((t.name, family))]
            if len(up) < 2:
                continue
            hosts = {}
            for host in self.slow_targets:
                try:
                    infos = await asyncio.wait_for(
                        loop.getaddrinfo(host, 443, family=family, type=socket.SOCK_STREAM), SLOW_TIMEOUT)
                except Exception:
                    continue     # no address of this family, or no answer: nothing to compare
                if infos:
                    hosts[host] = infos[0][4][0]
            jobs = [(t, host, ip) for host, ip in hosts.items() for t in up]
            times = await asyncio.gather(*(self.handshake_time(t, family, host, ip) for t, host, ip in jobs))
            per_host = {}
            for (t, host, _ip), secs in zip(jobs, times):
                per_host.setdefault(host, {})[t.name] = secs
            results[family] = per_host
        self.slow_round(results)
        self.write_state()

    async def run_slow(self, interval=SLOW_INTERVAL):
        while True:
            await asyncio.sleep(interval)
            try:
                await self.slow_probe_all()
            except Exception as e:
                log.error("WARP slow-path probes failed: %r", e)

    def state(self):
        """What holyWisp reads: the tunnels up per family, in config order."""
        return {fam: [{"name": t.name, "mark": t.mark} for t in self.healthy(f)]
                for fam, f in (("v4", socket.AF_INET), ("v6", socket.AF_INET6))}

    def write_state(self):
        """Atomically replace state_path (temp file + rename), so a reader never sees half of it.

        Never raises: holyWisp falls back by itself when the file is missing or stale.
        """
        if not self.state_path:
            return
        tmp = "%s.%d.tmp" % (self.state_path, os.getpid())
        try:
            fd = os.open(tmp, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o640)
            with os.fdopen(fd, "w") as f:
                json.dump(self.state(), f, separators=(",", ":"))
                f.write("\n")
            os.replace(tmp, self.state_path)
        except OSError as e:
            try:
                os.unlink(tmp)
            except OSError:
                pass
            now = time.monotonic()
            if now - self._state_err_logged >= 60.0:
                self._state_err_logged = now
                log.warning("can't write WARP state %s for holyWisp (%s); its UDP goes unmarked", self.state_path, e)

    async def run(self, interval=PROBE_INTERVAL):
        while True:
            try:
                await self.probe_all()
            except Exception as e:
                log.error("WARP tunnel probes failed: %r", e)
            await asyncio.sleep(interval)


_warp_down_logged = 0.0
_warp_none_logged = 0.0


async def open_clean(cfg, ip, port, family, key=None, bypass=False):
    """A clean stream to a public ip:port, through WARP when the config names a WARP mode.

    key picks the WARP tunnel in kernel mode (site_key of the name, or the literal IP). bypass: the
    name is on warp_bypass, and the stream goes out directly whatever the mode or the tunnels say.
    """
    global _warp_down_logged, _warp_none_logged
    if bypass:
        return await asyncio.open_connection(ip, port, family=family)
    kernel = cfg.get("warp_kernel")
    if kernel is not None:
        tunnel = kernel.pick(ip if key is None else key, family)
        if tunnel is not None:
            # A failure here is the destination's or the tunnel's; we can't tell
            # which, so it fails like a direct connect and the probes judge the tunnel.
            return await open_marked(ip, port, family, tunnel.mark)
        if not cfg.get("warp_fallback_direct"):
            raise OSError("no healthy WARP tunnel for %s" % FAMILY_NAME.get(family, family))
        now = time.monotonic()
        if now - _warp_none_logged >= 60.0:
            _warp_none_logged = now
            log.warning("no healthy WARP tunnel for %s; clean streams go out directly", FAMILY_NAME.get(family, family))
        return await asyncio.open_connection(ip, port, family=family)
    warp = cfg.get("warp")
    if warp is None:
        return await asyncio.open_connection(ip, port, family=family)
    try:
        r, w = await asyncio.open_connection(warp[0], warp[1])
    except OSError as e:
        if not cfg.get("warp_fallback_direct"):
            raise OSError("WARP proxy %s:%d unreachable: %s" % (warp[0], warp[1], e))
        now = time.monotonic()
        if now - _warp_down_logged >= 60.0:
            _warp_down_logged = now
            log.warning("WARP proxy %s:%d unreachable (%s); clean streams go out directly", warp[0], warp[1], e)
        return await asyncio.open_connection(ip, port, family=family)
    atyp = 1 if family == socket.AF_INET else 4
    try:
        await socks_request(r, w, atyp, socket.inet_pton(family, ip), struct.pack("!H", port), "WARP")
    except BaseException:
        w.close()
        raise
    return r, w


CLIENT_KEY = re.compile(r"[0-9a-f]{16}")     # fullmatch: "$" would let a trailing newline through


def client_key(uname):
    """holyWisp's per-client key (proxy-client-key), sent as the RFC 1929 username, or None.

    Untrusted bytes: only exactly 16 lower-case hex digits count, anything else is ignored.
    """
    try:
        text = uname.decode("ascii")
    except (UnicodeDecodeError, AttributeError):
        return None
    return text if CLIENT_KEY.fullmatch(text) else None


def warp_key(client, site):
    """The string a WARP tunnel is picked by: "<client key>/<site>", or the site alone.

    holyWisp picks a UDP stream's tunnel by the same string, so a client's UDP and TCP
    to one site leave through one tunnel.
    """
    return "%s/%s" % (client, site) if client else site


async def dial(cfg, pins, host, port, client=None):
    """Connect to a clean name. The caller bounds the whole of it with CONNECT_TIMEOUT."""
    loop = asyncio.get_event_loop()
    infos = await loop.getaddrinfo(host, port, type=socket.SOCK_STREAM)
    # Dial only what this lookup returned and only if it is public; the name is
    # never handed to anything that would look it up again.
    infos = [i for i in infos if public_address(i[4][0])]
    if not infos:
        raise NoPublicAddress()
    v4_first = pins.v4_first(host)
    if v4_first:
        infos = [i for i in infos if i[0] == socket.AF_INET] + [i for i in infos if i[0] != socket.AF_INET]
    v6_until = loop.time() + V6_WAIT
    v6_failed = False
    err = OSError("no address for %s" % host)
    for n, (family, _type, _proto, _canon, addr) in enumerate(infos):
        # Sequential, never a race: a race would put TCP on IPv4 while UDP stays on IPv6.
        wait = None
        if family == socket.AF_INET6 and any(i[0] == socket.AF_INET for i in infos[n + 1:]):
            wait = v6_until - loop.time()
            if wait <= 0:
                continue
        try:
            r, w = await asyncio.wait_for(open_clean(cfg, addr[0], port, family, key=warp_key(client, site_key(host)),
                                                     bypass=bypasses_warp(cfg, host)), wait)
        except (OSError, asyncio.TimeoutError) as e:
            err = e if str(e) else OSError("no answer from %s" % addr[0])
            v6_failed = v6_failed or family == socket.AF_INET6
            continue
        pins.landed(host, family, not v4_first, v6_failed)
        return r, w
    raise err


# ---------------------------------------------------------------- name gate
#
# holyWisp resolves every stream's hostname before it dials (the egress check
# for TCP, the address it sends to for UDP), A then AAAA, one question per
# datagram. Shady names are answered here, and so is the AAAA question of a
# name pinned to IPv4; everything else, any other question and anything
# unparsable goes to the upstream resolvers and their answer goes back
# untouched.

def dns_question(msg):
    """(name, qtype, end offset of the question) of a one-question IN query, else None."""
    if len(msg) < 17 or msg[2] & 0xF8 or struct.unpack("!H", msg[4:6])[0] != 1:
        return None
    labels, off = [], 12
    while True:
        if off >= len(msg):
            return None
        n = msg[off]
        off += 1
        if n == 0:
            break
        if n > 63 or off + n > len(msg):
            return None
        labels.append(msg[off:off + n].decode("ascii", "replace"))
        off += n
    if off + 4 > len(msg):
        return None
    qtype, qclass = struct.unpack("!HH", msg[off:off + 4])
    if qclass != 1 or not labels:
        return None
    return ".".join(labels), qtype, off + 4


def dns_answer(query, qend, answer=b""):
    """A NOERROR reply to the query's question, with one record or none."""
    return query[:2] + struct.pack("!HHHHH", 0x8180, 1, 1 if answer else 0, 0, 0) + query[12:qend] + answer


def dns_sink_answer(query, qend, qtype, sink):
    """Answer an A/AAAA question with the sink address, or with no records for the other family."""
    sink_type, sink_addr = sink
    if qtype != sink_type:
        return dns_answer(query, qend)
    return dns_answer(query, qend, b"\xc0\x0c" + struct.pack("!HHIH", qtype, 1, GATE_SHADY_TTL, len(sink_addr)) + sink_addr)


def gate_sink(host):
    """The relay address as (record type, packed address). It must be a literal."""
    for family, rtype in ((socket.AF_INET, 1), (socket.AF_INET6, 28)):
        try:
            return rtype, socket.inet_pton(family, host)
        except OSError:
            pass
    raise SystemExit("edge-router.json: dns_port needs relay_host to be an IP address, not %r" % host)


def gate_upstreams(cfg):
    out = []
    for entry in cfg.get("dns_upstreams") or ["1.1.1.1", "1.0.0.1"]:
        host, port = entry, 53
        if entry.startswith("["):                         # "[v6]:port", as holyWisp writes it
            host, _, rest = entry[1:].partition("]")
            port = int(rest[1:]) if rest.startswith(":") else 53
        elif entry.count(":") == 1:                       # "v4:port"
            host, _, rest = entry.partition(":")
            port = int(rest)
        out.append((host, port))
    return out


class _DnsReply(asyncio.DatagramProtocol):
    def __init__(self, fut):
        self.fut = fut

    def datagram_received(self, data, addr):
        if not self.fut.done():
            self.fut.set_result(data)

    def error_received(self, exc):
        if not self.fut.done():
            self.fut.set_exception(exc)


async def dns_forward(upstreams, query):
    loop = asyncio.get_event_loop()
    for upstream in upstreams:
        fut = loop.create_future()
        try:
            transport, _ = await loop.create_datagram_endpoint(lambda: _DnsReply(fut), remote_addr=upstream)
        except OSError:
            continue
        try:
            transport.sendto(query)
            resp = await asyncio.wait_for(fut, GATE_UPSTREAM_TIMEOUT)
            if resp[:2] == query[:2]:
                return resp
        except (OSError, asyncio.TimeoutError):
            pass
        finally:
            transport.close()
    return None


class NameGate(asyncio.DatagramProtocol):
    """holyWisp's first resolver. A name this router must handle itself is answered with the sink.

    Shady names always. With `adult` (edge-router.json "gate_adult", set when holyWisp dials
    clean TCP itself: proxy-only-to = the sink, tcp-warp), adult names too: holyWisp then sends
    only streams that resolved to the sink here, by name, and this router refuses or relays them
    as before. Their UDP is refused like a shady name's (the sink is IPAddressDeny'd).
    """

    def __init__(self, clf, pins, sink, upstreams, adult=False):
        self.clf = clf
        self.pins = pins
        self.sink = sink
        self.upstreams = upstreams
        self.routed_verdicts = (SHADY, ADULT) if adult else (SHADY,)
        self.fail_closed = adult
        self.transport = None
        self.tasks = set()       # the loop only holds tasks weakly

    def connection_made(self, transport):
        self.transport = transport

    def datagram_received(self, data, addr):
        task = asyncio.ensure_future(self.answer(data, addr))
        self.tasks.add(task)
        task.add_done_callback(self.tasks.discard)

    async def routed(self, name):
        """Whether the name's addresses are the sink: a verdict this router acts on itself.

        No verdict in time (or an error): only UDP rides on this answer without `adult`, so it
        fails open as clean. With `adult`, holyWisp dials TCP by this answer too, and a miss would
        let a shady or adult name leave without the router: the sink then, and this router
        classifies the stream at connect time with its full wait, as it always did.
        """
        # shield: the lookup is shared with the SOCKS side and must outlive our wait.
        try:
            return await asyncio.wait_for(asyncio.shield(self.clf.verdict(name)), GATE_VERDICT_TIMEOUT) in self.routed_verdicts
        except asyncio.TimeoutError:
            return self.fail_closed
        except Exception as e:
            log.warning("name gate: no verdict for %s (%r); answering as %s", name, e,
                        "the router's" if self.fail_closed else "clean")
            return self.fail_closed

    async def answer(self, query, addr):
        try:
            resp = None
            q = dns_question(query)
            if q is not None and q[1] in (1, 28) and await self.routed(q[0]):
                resp = dns_sink_answer(query, q[2], q[1], self.sink)
            elif q is not None and q[1] == 28 and self.pins.hides_v6(q[0]):
                resp = dns_answer(query, q[2])
            if resp is None:
                resp = await dns_forward(self.upstreams, query)
            if resp is not None:         # no answer: holyWisp times out and asks its next dns-server
                self.transport.sendto(resp, addr)
        except Exception as e:
            log.error("name gate error: %r", e)


# ---------------------------------------------------------------- SOCKS5

REP_OK, REP_FAIL, REP_NOT_ALLOWED, REP_UNREACH, REP_REFUSED, REP_CMD, REP_ATYP = 0, 1, 2, 4, 5, 7, 8


def reply(writer, code):
    writer.write(b"\x05" + bytes([code]) + b"\x00\x01" + b"\x00" * 6)


async def pipe(reader, writer):
    try:
        while True:
            data = await reader.read(65536)
            if not data:
                break
            writer.write(data)
            await writer.drain()
    except (ConnectionError, asyncio.CancelledError, asyncio.TimeoutError):
        pass
    finally:
        try:
            writer.close()
        except Exception:
            pass


async def socks_connect_via_relay(cfg, atyp, dest, port):
    """Open a stream to dest through amph's authenticated SOCKS5 relay."""
    r, w = await asyncio.wait_for(
        asyncio.open_connection(cfg["relay_host"], int(cfg["relay_port"])), RELAY_CONNECT_TIMEOUT)
    try:
        w.write(b"\x05\x01\x02")                                  # offer username/password only
        await w.drain()
        ver, method = await r.readexactly(2)
        if ver != 5 or method != 2:
            raise OSError("relay refused auth method")
        user = cfg["relay_user"].encode()
        pw = cfg["relay_pass"].encode()
        w.write(b"\x01" + bytes([len(user)]) + user + bytes([len(pw)]) + pw)
        await w.drain()
        _v, status = await r.readexactly(2)
        if status != 0:
            raise OSError("relay auth failed")
        await socks_connect(r, w, atyp, dest, port, "relay")
        return r, w
    except Exception:
        w.close()
        raise


async def socks_connect(r, w, atyp, dest, port, who):
    """Send a SOCKS5 CONNECT on an authenticated stream and read the reply past its bound address."""
    w.write(b"\x05\x01\x00" + bytes([atyp]) + dest + port)
    await w.drain()
    hdr = await r.readexactly(4)
    if hdr[1] != 0:
        raise OSError("%s connect failed rep=%d" % (who, hdr[1]))
    if hdr[3] == 1:
        await r.readexactly(6)
    elif hdr[3] == 3:
        n = (await r.readexactly(1))[0]
        await r.readexactly(n + 2)
    elif hdr[3] == 4:
        await r.readexactly(18)


async def socks_request(r, w, atyp, dest, port, who):
    """No-auth SOCKS5 greeting, then CONNECT (WARP's local proxy)."""
    w.write(b"\x05\x01\x00")
    await w.drain()
    ver, method = await r.readexactly(2)
    if ver != 5 or method != 0:
        raise OSError("%s refused the no-auth method" % who)
    await socks_connect(r, w, atyp, dest, port, who)


async def handle(cfg, clf, pins, reader, writer):
    remote_w = None
    try:
        ver, nmeth = await reader.readexactly(2)
        methods = await reader.readexactly(nmeth)
        client = None
        if ver != 5 or not (0 in methods or 2 in methods):
            writer.write(b"\x05\xff")
            await writer.drain()
            return
        if 2 in methods:
            # holyWisp with proxy-client-key offers 0 and 2: the username is the client's key.
            # The password (the proxy URL's, or empty) means nothing here: only loopback reaches us.
            writer.write(b"\x05\x02")
            await writer.drain()
            aver, ulen = await reader.readexactly(2)
            uname = await reader.readexactly(ulen)
            plen = (await reader.readexactly(1))[0]
            await reader.readexactly(plen)
            if aver != 1:
                writer.write(b"\x01\x01")
                await writer.drain()
                return
            writer.write(b"\x01\x00")
            client = client_key(uname)
        else:
            writer.write(b"\x05\x00")
        await writer.drain()

        ver, cmd, _rsv, atyp = await reader.readexactly(4)
        if ver != 5 or cmd != 1:
            reply(writer, REP_CMD)
            await writer.drain()
            return
        if atyp == 1:
            raw = await reader.readexactly(4)
            dest_host = socket.inet_ntop(socket.AF_INET, raw)
            dest = raw
        elif atyp == 3:
            n = (await reader.readexactly(1))[0]
            raw = await reader.readexactly(n)
            dest_host = raw.decode("ascii", "replace")
            dest = bytes([n]) + raw
        elif atyp == 4:
            raw = await reader.readexactly(16)
            dest_host = socket.inet_ntop(socket.AF_INET6, raw)
            dest = raw
        else:
            reply(writer, REP_ATYP)
            await writer.drain()
            return
        port_raw = await reader.readexactly(2)
        port = struct.unpack("!H", port_raw)[0]

        # Literal IPs carry no hostname to classify, so they go direct. holyWisp
        # lets them through on the edges (allow-direct-ip = on, for the v86
        # guests in vibeOS); they must be public, like a name's addresses.
        if atyp != 3 and not public_address(dest_host):
            log.warning("refused %s:%d: no public address", dest_host, port)
            reply(writer, REP_NOT_ALLOWED)
            await writer.drain()
            return
        verdict = CLEAN if atyp != 3 else await clf.verdict(dest_host)

        if verdict == ADULT:
            reply(writer, REP_NOT_ALLOWED)
            await writer.drain()
            return

        try:
            if verdict == SHADY:
                remote_r, remote_w = await socks_connect_via_relay(cfg, atyp, dest, port_raw)
            elif atyp == 3:
                remote_r, remote_w = await asyncio.wait_for(dial(cfg, pins, dest_host, port, client), CONNECT_TIMEOUT)
            else:
                family = socket.AF_INET if atyp == 1 else socket.AF_INET6
                remote_r, remote_w = await asyncio.wait_for(
                    open_clean(cfg, dest_host, port, family, key=warp_key(client, dest_host)), CONNECT_TIMEOUT)
        except NoPublicAddress:
            log.warning("refused %s:%d: no public address", dest_host, port)
            reply(writer, REP_NOT_ALLOWED)
            await writer.drain()
            return
        except (OSError, asyncio.TimeoutError, asyncio.IncompleteReadError) as e:
            log.info("connect %s:%d (%s) failed: %s", dest_host, port, verdict, e)
            reply(writer, REP_UNREACH)
            await writer.drain()
            return

        reply(writer, REP_OK)
        await writer.drain()
        await asyncio.gather(pipe(reader, remote_w), pipe(remote_r, writer))
    except (asyncio.IncompleteReadError, ConnectionError, asyncio.TimeoutError):
        pass
    except Exception as e:
        log.error("handler error: %r", e)
    finally:
        writer.close()
        if remote_w is not None:
            remote_w.close()


async def main():
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(name)s %(levelname)s %(message)s")
    cfg = load_config()
    clf = Classifier(cfg)
    pins = FamilyPins()
    kernel = cfg["warp_kernel"]
    probes = slow_probes = None  # the loop only holds tasks weakly
    if kernel is not None:
        # Before we listen, so the first streams already know which tunnels work.
        # Each probe is bounded by PROBE_TIMEOUT and they all run at once.
        await kernel.probe_all()
        for t in kernel.tunnels:
            log.info("%s", kernel.describe(t))
        probes = asyncio.ensure_future(kernel.run())
        slow_probes = asyncio.ensure_future(kernel.run_slow()) if kernel.slow_targets else None
    server = await asyncio.start_server(
        lambda r, w: handle(cfg, clf, pins, r, w), LISTEN_HOST, LISTEN_PORT, backlog=1024)
    log.info("listening on %s:%d; relay=%s:%s", LISTEN_HOST, LISTEN_PORT, cfg["relay_host"], cfg["relay_port"])
    if cfg["warp"]:
        log.info("clean streams leave through WARP at %s:%d (fallback direct: %s)",
                 cfg["warp"][0], cfg["warp"][1], bool(cfg.get("warp_fallback_direct")))
    if kernel is not None:
        log.info("clean streams leave through WARP tunnels %s (marks %s; fallback direct: %s)",
                 ", ".join(t.name for t in kernel.tunnels), ", ".join("%#x" % t.mark for t in kernel.tunnels),
                 bool(cfg.get("warp_fallback_direct")))
        if kernel.slow_targets:
            log.info("tunnels compared by TLS handshake every %d s with %s",
                     SLOW_INTERVAL, ", ".join(kernel.slow_targets))
    exact, suffixes = cfg["warp_bypass"]
    if exact or suffixes:
        log.info("kept off WARP: %s", ", ".join(sorted(exact) + ["*" + x for x in suffixes]))
    if cfg.get("dns_port"):
        sink, upstreams = gate_sink(cfg["relay_host"]), gate_upstreams(cfg)
        try:
            await asyncio.get_event_loop().create_datagram_endpoint(
                lambda: NameGate(clf, pins, sink, upstreams, adult=bool(cfg.get("gate_adult"))),
                local_addr=(LISTEN_HOST, int(cfg["dns_port"])))
            log.info("name gate on %s:%d (udp); shady names answer %s; upstreams %s",
                     LISTEN_HOST, int(cfg["dns_port"]), cfg["relay_host"], upstreams)
        except OSError as e:
            # Fail open, like a classifier outage: TCP routing must not stop for this.
            log.error("name gate NOT listening on %s:%d (%s); UDP to shady names is not refused",
                      LISTEN_HOST, int(cfg["dns_port"]), e)
    async with server:
        await server.serve_forever()


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        pass
