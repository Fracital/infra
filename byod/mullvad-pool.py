#!/usr/bin/env python3
"""Local SOCKS5 front that load-balances across Mullvad SOCKS5 relays.

abulxt-wisp dials 127.0.0.1:1080 (no auth). For each CONNECT we pick the
next healthy upstream (round-robin), replay the SOCKS5 handshake to it,
then splice bytes. Upstreams are probed periodically with a TCP connect;
failures mark an upstream down for a cooldown before it re-enters rotation.

This replaces the BYOD SSH-tunnel egress: traffic exits via Mullvad relays
reachable through the locally installed Mullvad routes (10.124.0.0/16,
100.64.0.0/16, DNS 100.64.0.3).
"""

import asyncio
import json
import logging
import random
import struct
import time
from pathlib import Path

CONFIG_PATH = Path("/etc/abulxt/mullvad-pool.json")
LISTEN_HOST = "127.0.0.1"
LISTEN_PORT = 1080

RELAYS_URL = "https://api.mullvad.net/www/relays/wireguard/"
MULLVAD_DNS = "100.64.0.3"      # Mullvad adblock/tracker DNS; resolves relay
                                # socks names to in-tunnel 10.124.x.x addrs
HEALTH_INTERVAL = 30.0          # seconds between probes of each upstream
HEALTH_TIMEOUT = 5.0            # TCP connect timeout for probes
FAIL_COOLDOWN = 45.0            # seconds an upstream stays out of rotation
CONNECT_TIMEOUT = 10.0          # upstream connect timeout for real traffic
DNS_REFRESH = 300.0             # re-resolve upstream hostnames periodically
RELAYS_REFRESH = 3600.0         # re-fetch the relay directory periodically

log = logging.getLogger("mullvad-pool")


async def https_get(url: str, timeout: float = 20.0) -> bytes:
    """Minimal async HTTPS GET (TLS-wrapped HTTP/1.0)."""
    host, _, rest = url.removeprefix("https://").partition("/")
    path = "/" + rest
    reader, writer = await asyncio.wait_for(
        asyncio.open_connection(host, 443, ssl=True, server_hostname=host), timeout)
    try:
        writer.write(
            f"GET {path} HTTP/1.0\r\nHost: {host}\r\n"
            f"User-Agent: mullvad-pool\r\nAccept: application/json\r\nConnection: close\r\n\r\n"
            .encode())
        await writer.drain()
        body = b""
        while chunk := await reader.read(65536):
            body += chunk
        return body.split(b"\r\n\r\n", 1)[1]
    finally:
        writer.close()
        try:
            await writer.wait_closed()
        except OSError:
            pass


async def resolve_a(hostname: str, server: str = MULLVAD_DNS) -> str | None:
    """Minimal DNS A-record query against a specific resolver (UDP)."""
    tid = random.randrange(0x10000)
    qname = b"".join(bytes([len(p)]) + p.encode() for p in hostname.split(".")) + b"\x00"
    query = struct.pack("!HHHHHH", tid, 0x0100, 1, 0, 0, 0) + qname + struct.pack("!HH", 1, 1)

    loop = asyncio.get_running_loop()
    fut = loop.create_future()

    class Proto(asyncio.DatagramProtocol):
        def datagram_received(self, data, _addr):
            if not fut.done():
                fut.set_result(data)

        def error_received(self, _exc):
            if not fut.done():
                fut.set_exception(OSError("dns udp error"))

    transport, _ = await loop.create_datagram_endpoint(Proto, remote_addr=(server, 53))
    try:
        transport.sendto(query)
        data = await asyncio.wait_for(fut, 5.0)
    except (OSError, asyncio.TimeoutError):
        return None
    finally:
        transport.close()

    if len(data) < 12 or struct.unpack("!H", data[:2])[0] != tid:
        return None
    ancount = struct.unpack("!H", data[6:8])[0]
    offset = 12
    # skip question
    while data[offset] != 0:
        offset += data[offset] + 1
    offset += 5
    for _ in range(ancount):
        # skip name (may be pointer)
        while True:
            b = data[offset]
            if b & 0xC0 == 0xC0:
                offset += 2
                break
            if b == 0:
                offset += 1
                break
            offset += b + 1
        rtype = struct.unpack("!H", data[offset:offset + 2])[0]
        rdlen = struct.unpack("!H", data[offset + 8:offset + 10])[0]
        offset += 10
        if rtype == 1 and rdlen == 4:
            return ".".join(str(b) for b in data[offset:offset + 4])
        offset += rdlen
    return None


class Upstream:
    __slots__ = ("name", "addr", "port", "city", "healthy", "down_until")

    def __init__(self, name: str, addr: str | None, port: int, city: str):
        self.name = name
        self.addr = addr
        self.port = port
        self.city = city
        self.healthy = True
        self.down_until = 0.0

    def available(self) -> bool:
        return self.addr is not None and (self.healthy or time.monotonic() >= self.down_until)

    def mark_down(self):
        self.healthy = False
        self.down_until = time.monotonic() + FAIL_COOLDOWN

    def __repr__(self):
        return f"{self.city}/{self.name}({self.addr}, {'up' if self.available() else 'down'})"


def load_config() -> dict:
    cfg = json.loads(CONFIG_PATH.read_text())
    cfg.setdefault("cities", ["was", "qas", "nyc"])
    cfg.setdefault("upstreams", [])
    return cfg


async def fetch_upstreams(cfg: dict) -> list[Upstream]:
    """Fetch the live Mullvad relay directory and filter to wanted cities."""
    try:
        raw = await https_get(RELAYS_URL)
        relays = json.loads(raw)
    except (OSError, asyncio.TimeoutError, ValueError) as e:
        log.error("relay directory fetch failed: %s", e)
        return []
    cities = set(cfg["cities"])
    out = []
    for r in relays:
        socks = r.get("socks_name")
        if not (r.get("active") and socks and r.get("city_code") in cities):
            continue
        out.append(Upstream(socks, None, int(r.get("socks_port", 1080)), r["city_code"]))
    return out


async def sync_upstreams(pool: "Pool", cfg: dict):
    """Reconcile pool.upstreams with the live relay directory, preserving
    resolved addresses and health state for relays that still exist."""
    fresh = await fetch_upstreams(cfg)
    if not fresh:
        return
    by_name = {u.name: u for u in pool.upstreams}
    merged = []
    for u in fresh:
        old = by_name.pop(u.name, None)
        if old is not None:
            u.addr, u.healthy, u.down_until = old.addr, old.healthy, old.down_until
        merged.append(u)
    removed = set(by_name)
    added = {u.name for u in fresh} - {u.name for u in pool.upstreams}
    pool.upstreams[:] = merged
    if removed:
        log.info("relays removed from directory: %s", ", ".join(sorted(removed)))
    if added:
        log.info("relays added from directory: %s", ", ".join(sorted(added)))
    await resolve_upstreams(pool.upstreams)


async def resolve_upstreams(upstreams: list[Upstream]):
    for up in upstreams:
        addr = await resolve_a(up.name)
        if addr:
            if addr != up.addr:
                log.info("resolved %s -> %s", up.name, addr)
            up.addr = addr
        elif up.addr is None:
            log.warning("could not resolve %s via %s", up.name, MULLVAD_DNS)


async def relays_loop(pool: "Pool", cfg: dict):
    while True:
        await asyncio.sleep(RELAYS_REFRESH)
        try:
            await sync_upstreams(pool, cfg)
        except Exception as e:
            log.error("relay sync failed: %s", e)


async def probe(up: Upstream):
    if up.addr is None:
        return
    try:
        _reader, writer = await asyncio.wait_for(
            asyncio.open_connection(up.addr, up.port), HEALTH_TIMEOUT)
        writer.close()
        try:
            await writer.wait_closed()
        except OSError:
            pass
        if not up.healthy:
            log.info("upstream recovered: %s", up)
        up.healthy = True
    except (OSError, asyncio.TimeoutError) as e:
        if up.healthy:
            log.warning("upstream failed probe: %s (%s)", up, e)
        up.mark_down()


async def health_loop(upstreams: list[Upstream]):
    while True:
        await asyncio.gather(*(probe(u) for u in list(upstreams)), return_exceptions=True)
        await asyncio.sleep(HEALTH_INTERVAL)


async def pipe(reader: asyncio.StreamReader, writer: asyncio.StreamWriter):
    try:
        while data := await reader.read(65536):
            writer.write(data)
            await writer.drain()
    except (ConnectionError, asyncio.CancelledError):
        pass
    finally:
        writer.close()


class Pool:
    def __init__(self, upstreams: list[Upstream]):
        self.upstreams = upstreams
        self._idx = random.randrange(len(upstreams)) if upstreams else 0

    def next(self) -> Upstream | None:
        n = len(self.upstreams)
        for i in range(n):
            up = self.upstreams[(self._idx + i) % n]
            if up.available():
                self._idx = (self._idx + i + 1) % n
                return up
        # All down: fall back to any (probe may be lagging recovery)
        return self.upstreams[self._idx % n] if n else None


def reply(writer: asyncio.StreamWriter, code: int):
    writer.write(b"\x05" + bytes([code]) + b"\x00\x01" + b"\x00" * 6)


async def handle(pool: "Pool", reader: asyncio.StreamReader, writer: asyncio.StreamWriter):
    remote_writer = None
    try:
        version, method_count = await reader.readexactly(2)
        methods = await reader.readexactly(method_count)
        if version != 5:
            return
        # We accept no-auth from local clients only; upstream needs no auth.
        if 0 not in methods:
            writer.write(b"\x05\xff")
            await writer.drain()
            return
        writer.write(b"\x05\x00")
        await writer.drain()

        version, command, _reserved, address_type = await reader.readexactly(4)
        if version != 5 or command != 1:
            reply(writer, 0x07)
            await writer.drain()
            return

        if address_type == 1:
            atyp, dest = 1, await reader.readexactly(4)
        elif address_type == 3:
            length = (await reader.readexactly(1))[0]
            atyp, dest = 3, bytes([length]) + await reader.readexactly(length)
        elif address_type == 4:
            atyp, dest = 4, await reader.readexactly(16)
        else:
            reply(writer, 0x08)
            await writer.drain()
            return
        port = await reader.readexactly(2)

        up = pool.next()
        if up is None:
            reply(writer, 0x01)
            await writer.drain()
            return

        try:
            remote_reader, remote_writer = await asyncio.wait_for(
                asyncio.open_connection(up.addr, up.port), CONNECT_TIMEOUT)
        except (OSError, asyncio.TimeoutError):
            up.mark_down()
            log.warning("connect failed via %s", up)
            reply(writer, 0x05)
            await writer.drain()
            return

        # Replay handshake upstream: greeting, then CONNECT request verbatim.
        remote_writer.write(b"\x05\x01\x00")
        remote_writer.write(b"\x05\x01\x00" + bytes([atyp]) + dest + port)
        await remote_writer.drain()

        # Greeting response
        g = await remote_reader.readexactly(2)
        if g[1] == 0xFF:
            reply(writer, 0x01)
            await writer.drain()
            return
        # CONNECT response: ver, rep, rsv, atyp, bnd.addr, bnd.port
        head = await remote_reader.readexactly(4)
        if head[1] != 0x00:
            reply(writer, head[1])
            await writer.drain()
            return
        bound_len = {1: 4, 3: None, 4: 16}.get(head[3])
        if bound_len is None:
            ln = (await remote_reader.readexactly(1))[0]
            await remote_reader.readexactly(ln + 2)
        else:
            await remote_reader.readexactly(bound_len + 2)

        reply(writer, 0x00)
        await writer.drain()
        t1 = asyncio.create_task(pipe(reader, remote_writer))
        t2 = asyncio.create_task(pipe(remote_reader, writer))
        _done, pending = await asyncio.wait({t1, t2}, return_when=asyncio.FIRST_COMPLETED)
        for t in pending:
            t.cancel()
        await asyncio.gather(t1, t2, return_exceptions=True)
    except (OSError, asyncio.IncompleteReadError):
        pass
    finally:
        writer.close()
        if remote_writer is not None:
            remote_writer.close()


async def main():
    logging.basicConfig(level=logging.INFO, format="%(name)s: %(levelname)s %(message)s")
    cfg = load_config()
    pool = Pool([])
    await sync_upstreams(pool, cfg)
    if not pool.upstreams:
        # Fall back to static config if the directory is unreachable.
        pool.upstreams[:] = [
            Upstream(u["host"], None, int(u.get("port", 1080)), u.get("city", "?"))
            for u in cfg["upstreams"]
        ]
        await resolve_upstreams(pool.upstreams)
    if not pool.upstreams:
        raise SystemExit("no upstreams available")
    log.info("listening on %s:%d, upstreams: %s", LISTEN_HOST, LISTEN_PORT,
             ", ".join(f"{u.city}/{u.name}" for u in pool.upstreams))
    server = await asyncio.start_server(
        lambda r, w: handle(pool, r, w), LISTEN_HOST, LISTEN_PORT)
    async with server:
        await asyncio.gather(
            server.serve_forever(), health_loop(pool.upstreams), relays_loop(pool, cfg))


if __name__ == "__main__":
    asyncio.run(main())
