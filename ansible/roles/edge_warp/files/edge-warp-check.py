#!/usr/bin/env python3
"""Check kernel-mode WARP on this box (abulxt roles/edge_warp, README.md "Cloudflare WARP").

    edge-warp-check warp0:30465 warp1:30466 ...

For each tunnel:
  - `ip route get 1.1.1.1 mark <mark>` (and the IPv6 probe) leaves through that tunnel;
  - an HTTPS GET of /cdn-cgi/trace on 1.1.1.1 and on 2606:4700:4700::1111 from a
    socket carrying the mark says warp=on (the same probe edge-router.py runs).
Then the same GET from an unmarked socket must say warp=off over IPv4: the box's own
traffic, and everything else unmarked, still leaves from its own address. (Unmarked
IPv6 is reported but not required: a box may have no IPv6 egress.)

Prints one line per check and exits 1 if any required check fails. Every network
step has a timeout and every read is capped; the probes run in a few threads at most.
"""

import concurrent.futures
import socket
import ssl
import subprocess
import sys

SO_MARK = getattr(socket, "SO_MARK", 36)
TIMEOUT = 8.0
READ_MAX = 8192
TARGETS = {socket.AF_INET: "1.1.1.1", socket.AF_INET6: "2606:4700:4700::1111"}
FAMILY = {socket.AF_INET: "IPv4", socket.AF_INET6: "IPv6"}


def trace(family, mark):
    """warp= from Cloudflare's trace through a socket with this mark (0: unmarked)."""
    target = TARGETS[family]
    host = "[%s]" % target if family == socket.AF_INET6 else target
    sock = socket.socket(family, socket.SOCK_STREAM)
    try:
        sock.settimeout(TIMEOUT)
        if mark:
            sock.setsockopt(socket.SOL_SOCKET, SO_MARK, mark)
        sock.connect((target, 443))
        tls = ssl.create_default_context().wrap_socket(sock, server_hostname=target)
        sock = tls
        tls.sendall(("GET /cdn-cgi/trace HTTP/1.1\r\nHost: %s\r\nUser-Agent: edge-warp-check\r\n"
                     "Connection: close\r\n\r\n" % host).encode())
        data = b""
        while len(data) < READ_MAX:
            chunk = tls.recv(READ_MAX - len(data))
            if not chunk:
                break
            data += chunk
    except (OSError, ValueError) as e:
        return None, str(e) or type(e).__name__
    finally:
        sock.close()
    fields = {}
    for line in data.decode("ascii", "replace").splitlines():
        key, sep, value = line.partition("=")
        if sep and key in ("warp", "colo"):
            fields[key] = value.strip()
    return fields.get("warp"), "colo=%s" % fields.get("colo", "?")


def route_dev(family, mark):
    argv = ["ip", "-6" if family == socket.AF_INET6 else "-4", "route", "get", TARGETS[family], "mark", str(mark)]
    try:
        out = subprocess.run(argv, capture_output=True, text=True, timeout=5).stdout
    except (OSError, subprocess.SubprocessError) as e:
        return "error: %s" % e
    words = out.split()
    return words[words.index("dev") + 1] if "dev" in words[:-1] else (out.strip() or "no route")


def main(argv):
    tunnels = []
    for spec in argv:
        name, _, mark = spec.partition(":")
        try:
            tunnels.append((name, int(mark, 0)))
        except ValueError:
            print("usage: edge-warp-check NAME:MARK ...", file=sys.stderr)
            return 2
    if not tunnels:
        print("usage: edge-warp-check NAME:MARK ...", file=sys.stderr)
        return 2

    jobs = [(name, mark, fam) for name, mark in tunnels for fam in TARGETS] + [("unmarked", 0, fam) for fam in TARGETS]
    with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
        results = dict(zip(jobs, pool.map(lambda j: trace(j[2], j[1]), jobs)))

    ok = True
    for name, mark in tunnels:
        for fam in TARGETS:
            dev = route_dev(fam, mark)
            warp, note = results[(name, mark, fam)]
            good = dev == name and warp in ("on", "plus")
            ok = ok and good
            print("%-8s %s mark 0x%x: route dev %s, warp=%s (%s) %s"
                  % (name, FAMILY[fam], mark, dev, warp, note, "ok" if good else "FAIL"))
    for fam in TARGETS:
        warp, note = results[("unmarked", 0, fam)]
        good = warp == "off"
        required = fam == socket.AF_INET
        ok = ok and (good or not required)
        print("%-8s %s: warp=%s (%s) %s" % ("unmarked", FAMILY[fam], warp, note,
                                            "ok" if good else ("FAIL" if required else "not required")))
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
