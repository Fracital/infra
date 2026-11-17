#!/usr/bin/env python3
"""Authenticated SOCKS5 relay on amph for the edges' shady-traffic hop.

Edges connect here (username/password, RFC 1929) and every CONNECT is replayed
to the local mullvad-pool front (127.0.0.1:1080), so the stream exits through a
Mullvad relay. Listens on the public interface; amph's firewall restricts the
port to the edge subnets, and the credential is the second gate.

Config: /etc/abulxt/shady-relay.json  {"user": "...", "pass": "..."}
"""

import asyncio
import hmac
import json
import logging
from pathlib import Path

CONFIG_PATH = Path("/etc/abulxt/shady-relay.json")
LISTEN_HOST = "0.0.0.0"
LISTEN_PORT = 1082
POOL_HOST, POOL_PORT = "127.0.0.1", 1080
POOL_CONNECT_TIMEOUT = 10.0
HANDSHAKE_TIMEOUT = 10.0

log = logging.getLogger("shady-relay")


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


async def handle(creds, reader, writer):
    peer = writer.get_extra_info("peername")
    pool_w = None
    try:
        async def rx(n):
            return await asyncio.wait_for(reader.readexactly(n), HANDSHAKE_TIMEOUT)

        ver, nmeth = await rx(2)
        methods = await rx(nmeth)
        if ver != 5 or 2 not in methods:
            writer.write(b"\x05\xff")
            await writer.drain()
            return
        writer.write(b"\x05\x02")
        await writer.drain()

        aver = (await rx(1))[0]
        ulen = (await rx(1))[0]
        user = await rx(ulen)
        plen = (await rx(1))[0]
        pw = await rx(plen)
        ok = aver == 1 and hmac.compare_digest(user, creds[0]) and hmac.compare_digest(pw, creds[1])
        writer.write(b"\x01" + (b"\x00" if ok else b"\x01"))
        await writer.drain()
        if not ok:
            log.warning("auth failed from %s", peer)
            return

        ver, cmd, _rsv, atyp = await rx(4)
        if ver != 5 or cmd != 1:
            reply(writer, 7)
            await writer.drain()
            return
        if atyp == 1:
            dest = await rx(4)
        elif atyp == 3:
            n = (await rx(1))[0]
            dest = bytes([n]) + await rx(n)
        elif atyp == 4:
            dest = await rx(16)
        else:
            reply(writer, 8)
            await writer.drain()
            return
        port = await rx(2)

        try:
            pool_r, pool_w = await asyncio.wait_for(
                asyncio.open_connection(POOL_HOST, POOL_PORT), POOL_CONNECT_TIMEOUT)
        except (OSError, asyncio.TimeoutError):
            reply(writer, 1)
            await writer.drain()
            return

        pool_w.write(b"\x05\x01\x00")
        pool_w.write(b"\x05\x01\x00" + bytes([atyp]) + dest + port)
        await pool_w.drain()
        g = await asyncio.wait_for(pool_r.readexactly(2), POOL_CONNECT_TIMEOUT)
        if g != b"\x05\x00":
            reply(writer, 1)
            await writer.drain()
            return
        hdr = await asyncio.wait_for(pool_r.readexactly(4), POOL_CONNECT_TIMEOUT)
        if hdr[1] != 0:
            reply(writer, hdr[1])
            await writer.drain()
            return
        if hdr[3] == 1:
            await pool_r.readexactly(6)
        elif hdr[3] == 3:
            n = (await pool_r.readexactly(1))[0]
            await pool_r.readexactly(n + 2)
        elif hdr[3] == 4:
            await pool_r.readexactly(18)

        reply(writer, 0)
        await writer.drain()
        await asyncio.gather(pipe(reader, pool_w), pipe(pool_r, writer))
    except (asyncio.IncompleteReadError, ConnectionError, asyncio.TimeoutError):
        pass
    except Exception as e:
        log.error("handler error from %s: %r", peer, e)
    finally:
        writer.close()
        if pool_w is not None:
            pool_w.close()


async def main():
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(name)s %(levelname)s %(message)s")
    cfg = json.loads(CONFIG_PATH.read_text())
    creds = (cfg["user"].encode(), cfg["pass"].encode())
    server = await asyncio.start_server(
        lambda r, w: handle(creds, r, w), LISTEN_HOST, LISTEN_PORT, backlog=1024)
    log.info("listening on %s:%d -> pool %s:%d", LISTEN_HOST, LISTEN_PORT, POOL_HOST, POOL_PORT)
    async with server:
        await server.serve_forever()


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        pass
