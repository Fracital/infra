"""Tests for edge-router.py's public-address filter and WARP modes (stdlib only, Python 3.9+).

Run with: python3 -m unittest discover -s edge-wisp -p 'test_*.py'
Not installed on the edges: the edge_wisp role copies edge-router.py alone.
"""

import asyncio
import tempfile
import os
import hashlib
import importlib.util
import json
import socket
import unittest
from pathlib import Path
from unittest import mock

_spec = importlib.util.spec_from_file_location("edge_router", Path(__file__).with_name("edge-router.py"))
er = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(er)


class PublicAddress(unittest.TestCase):
    def test_public(self):
        for a in ("1.1.1.1", "93.184.216.34", "2606:4700:4700::1111", "::ffff:1.1.1.1", "64:ff9b::101:101",
                  "2002:101:101::1"):
            self.assertTrue(er.public_address(a), a)

    def test_not_public(self):
        for a in ("127.0.0.1", "10.1.2.3", "172.16.0.1", "192.168.1.1", "169.254.169.254", "100.64.0.1",
                  "0.0.0.0", "224.0.0.1", "255.255.255.255", "240.0.0.1", "::1", "::", "fe80::1%eth0",
                  "fc00::1", "fd12::1", "ff02::1", "::ffff:127.0.0.1", "::ffff:10.0.0.1", "64:ff9b::7f00:1",
                  "64:ff9b::a00:1", "2002:7f00:1::1", "2001:0:4136:e378:8000:63bf:3fff:fdd2", "not an ip", ""):
            self.assertFalse(er.public_address(a), a)


def _info(family, addr):
    sockaddr = (addr, 443) if family == socket.AF_INET else (addr, 443, 0, 0)
    return (family, socket.SOCK_STREAM, 6, "", sockaddr)


class Dial(unittest.TestCase):
    def run_dial(self, infos):
        dialled = []

        async def fake_open(addr, port, family=None):
            dialled.append(addr)
            return "r", "w"

        async def go():
            loop = asyncio.get_event_loop()
            with mock.patch.object(loop, "getaddrinfo", mock.AsyncMock(return_value=infos)), \
                    mock.patch.object(er.asyncio, "open_connection", fake_open):
                return await er.dial({"warp": None}, er.FamilyPins(), "rebind.example", 443)

        return asyncio.run(go()), dialled

    def test_rebound_name_is_refused(self):
        with self.assertRaises(er.NoPublicAddress):
            self.run_dial([_info(socket.AF_INET, "127.0.0.1"), _info(socket.AF_INET6, "::1")])

    def test_only_public_addresses_are_dialled(self):
        result, dialled = self.run_dial([_info(socket.AF_INET6, "fd00::1"), _info(socket.AF_INET, "10.0.0.5"),
                                         _info(socket.AF_INET, "1.1.1.1")])
        self.assertEqual(result, ("r", "w"))
        self.assertEqual(dialled, ["1.1.1.1"])


class WarpEndpoint(unittest.TestCase):
    def test_parse(self):
        self.assertIsNone(er.warp_endpoint(None))
        self.assertIsNone(er.warp_endpoint(""))
        self.assertEqual(er.warp_endpoint("127.0.0.1:40000"), ("127.0.0.1", 40000))
        self.assertEqual(er.warp_endpoint("[::1]:40000"), ("::1", 40000))

    def test_refused(self):
        for bad in ("1.1.1.1:40000", "localhost:40000", "127.0.0.1", "127.0.0.1:0", "127.0.0.1:x"):
            with self.assertRaises(SystemExit, msg=bad):
                er.warp_endpoint(bad)


class Warp(unittest.TestCase):
    """open_clean through a fake no-auth SOCKS5 proxy standing in for warp-cli's."""

    def run_open(self, ip, family, fallback=False, proxy_up=True, rep=0):
        seen = []

        async def proxy(r, w):
            seen.append(await r.readexactly(3))                    # greeting
            w.write(b"\x05\x00")
            hdr = await r.readexactly(4)
            dest = await r.readexactly(4 if hdr[3] == 1 else 16)
            port = await r.readexactly(2)
            seen.append((hdr, dest, port))
            w.write(b"\x05" + bytes([rep]) + b"\x00\x01" + bytes(6))
            await w.drain()
            w.close()

        direct = []

        async def go():
            server = await asyncio.start_server(proxy, "127.0.0.1", 0)
            port = server.sockets[0].getsockname()[1]
            if not proxy_up:
                server.close()
                await server.wait_closed()
            cfg = {"warp": ("127.0.0.1", port), "warp_fallback_direct": fallback}
            real_open = asyncio.open_connection

            async def open_conn(host, p, family=0):
                if host == "127.0.0.1":
                    return await real_open(host, p)
                direct.append(host)
                return "r", "w"

            with mock.patch.object(er.asyncio, "open_connection", open_conn):
                try:
                    result = await er.open_clean(cfg, ip, 443, family)
                    if isinstance(result[1], asyncio.StreamWriter):   # through the proxy
                        result[1].close()
                        return "warp"
                    return result
                finally:
                    server.close()

        return asyncio.run(go()), seen, direct

    def test_ipv4_goes_through_warp_as_a_literal(self):
        result, seen, direct = self.run_open("1.1.1.1", socket.AF_INET)
        self.assertEqual(result, "warp")
        self.assertEqual(seen[0], b"\x05\x01\x00")
        hdr, dest, port = seen[1]
        self.assertEqual(hdr, b"\x05\x01\x00\x01")
        self.assertEqual(dest, socket.inet_aton("1.1.1.1"))
        self.assertEqual(port, (443).to_bytes(2, "big"))
        self.assertEqual(direct, [])

    def test_ipv6_goes_through_warp_as_a_literal(self):
        result, seen, _direct = self.run_open("2606:4700:4700::1111", socket.AF_INET6)
        self.assertEqual(result, "warp")
        self.assertEqual(seen[1][0][3], 4)
        self.assertEqual(seen[1][1], socket.inet_pton(socket.AF_INET6, "2606:4700:4700::1111"))

    def test_refused_by_warp_fails_the_address(self):
        with self.assertRaises(OSError):
            self.run_open("1.1.1.1", socket.AF_INET, rep=5)

    def test_warp_down_fails_without_fallback(self):
        with self.assertRaises(OSError):
            self.run_open("1.1.1.1", socket.AF_INET, proxy_up=False)

    def test_warp_down_goes_direct_with_fallback(self):
        result, _seen, direct = self.run_open("1.1.1.1", socket.AF_INET, fallback=True, proxy_up=False)
        self.assertEqual(result, ("r", "w"))
        self.assertEqual(direct, ["1.1.1.1"])


# ---------------------------------------------------------------- WARP kernel mode

V4, V6 = socket.AF_INET, socket.AF_INET6


def tunnels(n=4):
    return [er.WarpTunnel("warp%d" % i, 0x7701 + i) for i in range(n)]


def all_up(n=4):
    wt = er.WarpTunnels(tunnels(n))
    for t in wt.tunnels:
        for f in (V4, V6):
            wt.record(t.name, f, True)
    return wt


KEYS = ["site%d.example" % i for i in range(200)]


class SiteKey(unittest.TestCase):
    def test_cases(self):
        for host, key in (("www.example.com", "example.com"), ("a.b.example.co.uk", "example.co.uk"),
                          ("example.com.", "example.com"), ("localhost", "localhost"),
                          ("rr3---sn-abc.googlevideo.com", "googlevideo.com"), ("a.b.c.com.au", "c.com.au"),
                          ("WWW.Example.COM", "example.com")):
            self.assertEqual(er.site_key(host), key, host)


class WarpTunnelsConfig(unittest.TestCase):
    BASE = {"doh_adult": "a", "doh_shady": "s", "doh_plain": "p", "relay_host": "10.0.0.1", "relay_port": 1080,
            "relay_user": "u", "relay_pass": "x"}

    def load(self, **extra):
        text = json.dumps(dict(self.BASE, **extra))
        with mock.patch.object(er, "CONFIG_PATH", mock.Mock(read_text=lambda: text)):
            return er.load_config()

    def test_valid(self):
        cfg = self.load(warp_tunnels=[{"name": "warp0", "mark": 30465}, {"name": "warp1", "mark": 30466}],
                        warp_fallback_direct=True)
        self.assertIsNone(cfg["warp"])
        kernel = cfg["warp_kernel"]
        self.assertEqual(kernel.tunnels, [er.WarpTunnel("warp0", 0x7701), er.WarpTunnel("warp1", 0x7702)])
        self.assertEqual(kernel.targets, {V4: "1.1.1.1", V6: "2606:4700:4700::1111"})

    def test_probe_targets(self):
        cfg = self.load(warp_tunnels=[{"name": "warp0", "mark": 1}], warp_probe_v4="1.0.0.1",
                        warp_probe_v6="2606:4700:4700::1001")
        self.assertEqual(cfg["warp_kernel"].targets, {V4: "1.0.0.1", V6: "2606:4700:4700::1001"})
        for bad in ({"warp_probe_v4": "2606:4700:4700::1111"}, {"warp_probe_v6": "1.1.1.1"},
                    {"warp_probe_v4": "one.one.one.one"}):
            with self.assertRaises(SystemExit, msg=bad):
                self.load(warp_tunnels=[{"name": "warp0", "mark": 1}], **bad)

    def test_absent_or_empty_is_no_kernel_mode(self):
        self.assertIsNone(self.load()["warp_kernel"])
        self.assertIsNone(self.load(warp_tunnels=[])["warp_kernel"])
        self.assertEqual(self.load(warp_proxy="127.0.0.1:40000", warp_tunnels=[])["warp"], ("127.0.0.1", 40000))

    def test_refused(self):
        for bad in ([{"name": "warp0", "mark": 1}, {"name": "warp0", "mark": 2}],     # duplicate name
                    [{"name": "warp0", "mark": 1}, {"name": "warp1", "mark": 1}],     # duplicate mark
                    [{"name": "warp0", "mark": 0}],
                    [{"name": "warp0", "mark": 0x100000000}],
                    [{"name": "warp0", "mark": -1}],
                    [{"name": "warp0", "mark": "30465"}],
                    [{"name": "warp0", "mark": 1.5}],
                    [{"name": "warp0", "mark": True}],
                    [{"name": "warp0"}],
                    [{"name": "", "mark": 1}],
                    [{"name": "warp 0", "mark": 1}],
                    [{"name": "a" * 16, "mark": 1}],
                    [{"name": 5, "mark": 1}],
                    [{"mark": 1}],
                    ["warp0"],
                    {"name": "warp0", "mark": 1}):
            with self.assertRaises(SystemExit, msg=repr(bad)):
                self.load(warp_tunnels=bad)

    def test_mark_bounds(self):
        cfg = self.load(warp_tunnels=[{"name": "a", "mark": 1}, {"name": "b.c-d_e", "mark": 0xFFFFFFFF}])
        self.assertEqual([t.mark for t in cfg["warp_kernel"].tunnels], [1, 0xFFFFFFFF])

    def test_both_modes_refused(self):
        with self.assertRaises(SystemExit):
            self.load(warp_proxy="127.0.0.1:40000", warp_tunnels=[{"name": "warp0", "mark": 30465}])


class TunnelPick(unittest.TestCase):
    def test_deterministic(self):
        a, b = all_up(), all_up()
        for key in KEYS:
            self.assertEqual(a.pick(key, V4), a.pick(key, V4))
            self.assertEqual(a.pick(key, V4), b.pick(key, V4))

    def test_spread(self):
        wt = all_up()
        self.assertGreaterEqual(len({wt.pick(k, V4).name for k in KEYS}), 3)

    def test_highest_blake2b_score_wins(self):
        wt = all_up()

        def score(key, name):
            return int.from_bytes(hashlib.blake2b((key + "\0" + name).encode(), digest_size=8).digest(), "big")

        for key in KEYS[:50]:
            self.assertEqual(wt.pick(key, V4), max(wt.tunnels, key=lambda t: score(key, t.name)))

    def test_none_healthy(self):
        wt = er.WarpTunnels(tunnels())
        self.assertIsNone(wt.pick("example.com", V4))     # never probed counts as down
        self.assertEqual(wt.healthy(V4), [])

    def test_dead_tunnel_is_skipped_and_others_stay(self):
        wt = all_up()
        before = {k: wt.pick(k, V4) for k in KEYS}
        dead = before[KEYS[0]]
        wt.record(dead.name, V4, False)
        wt.record(dead.name, V4, False)
        self.assertNotIn(dead, wt.healthy(V4))
        moved = wt.pick(KEYS[0], V4)
        self.assertIsNotNone(moved)
        self.assertNotEqual(moved, dead)
        for k in KEYS:
            if before[k] != dead:
                self.assertEqual(wt.pick(k, V4), before[k], k)     # rendezvous: only the dead tunnel's keys move
            else:
                self.assertNotEqual(wt.pick(k, V4), dead, k)
        self.assertEqual(wt.pick(KEYS[0], V6), dead)                # IPv6 state is its own
        wt.record(dead.name, V4, True)
        self.assertEqual({k: wt.pick(k, V4) for k in KEYS}, before)


class TunnelHealth(unittest.TestCase):
    def drive(self, wt, results):
        """One probe_all, the fake probe answering from results[(name, family)] (True, False or an exception)."""
        async def fake_probe(tunnel, family):
            r = results[(tunnel.name, family)]
            if isinstance(r, BaseException):
                raise r
            return r

        wt.probe = fake_probe
        asyncio.run(wt.probe_all())

    def test_transitions(self):
        wt = er.WarpTunnels(tunnels(1))
        state = lambda f: wt.up[("warp0", f)]
        self.drive(wt, {("warp0", V4): False, ("warp0", V6): True})
        self.assertFalse(state(V4))        # first result sets the state at once
        self.assertTrue(state(V6))
        self.drive(wt, {("warp0", V4): True, ("warp0", V6): False})
        self.assertTrue(state(V4))         # one success brings it up
        self.assertTrue(state(V6))         # one failure keeps it up
        self.drive(wt, {("warp0", V4): False, ("warp0", V6): False})
        self.assertTrue(state(V4))
        self.assertFalse(state(V6))        # two in a row take it down
        self.drive(wt, {("warp0", V4): RuntimeError("boom"), ("warp0", V6): True})
        self.assertFalse(state(V4))        # an exception is a failure, and probe_all survives it
        self.assertTrue(state(V6))

    def test_success_resets_the_count(self):
        wt = er.WarpTunnels(tunnels(1))
        for ok in (True, False, True, False, True, False):
            self.drive(wt, {("warp0", V4): ok, ("warp0", V6): ok})
            self.assertTrue(wt.up[("warp0", V4)], ok)

    def test_run_survives_errors(self):
        wt = er.WarpTunnels(tunnels(1))
        calls = []

        async def flaky():
            calls.append(1)
            if len(calls) == 1:
                raise RuntimeError("boom")

        wt.probe_all = flaky

        async def go():
            task = asyncio.ensure_future(wt.run(interval=0))
            while len(calls) < 3:
                await asyncio.sleep(0)
            task.cancel()

        asyncio.run(go())
        self.assertGreaterEqual(len(calls), 3)


class KernelOpenClean(unittest.TestCase):
    def run_open(self, wt, ip, family, key, fallback=False, marked_error=None):
        marked, direct = [], []

        async def fake_marked(addr, port, fam, mark, **kw):
            marked.append((addr, port, fam, mark))
            if marked_error is not None:
                raise marked_error
            return "mr", "mw"

        async def fake_direct(addr, port, family=0):
            direct.append(addr)
            return "dr", "dw"

        cfg = {"warp": None, "warp_kernel": wt, "warp_fallback_direct": fallback}

        async def go():
            with mock.patch.object(er, "open_marked", fake_marked), \
                    mock.patch.object(er.asyncio, "open_connection", fake_direct):
                return await er.open_clean(cfg, ip, 443, family, key=key)

        return asyncio.run(go()), marked, direct

    def test_marked_with_the_picked_tunnel(self):
        wt = all_up()
        for key in KEYS[:20]:
            result, marked, direct = self.run_open(wt, "93.184.216.34", V4, key)
            self.assertEqual(result, ("mr", "mw"))
            self.assertEqual(marked, [("93.184.216.34", 443, V4, wt.pick(key, V4).mark)])
            self.assertEqual(direct, [])

    def test_no_key_uses_the_ip(self):
        wt = all_up()
        _result, marked, _direct = self.run_open(wt, "2606:4700::1", V6, None)
        self.assertEqual(marked[0][3], wt.pick("2606:4700::1", V6).mark)

    def test_all_down_falls_back_direct(self):
        wt = er.WarpTunnels(tunnels())
        result, marked, direct = self.run_open(wt, "93.184.216.34", V4, "example.com", fallback=True)
        self.assertEqual(result, ("dr", "dw"))
        self.assertEqual((marked, direct), ([], ["93.184.216.34"]))

    def test_all_down_fails_without_fallback(self):
        wt = er.WarpTunnels(tunnels())
        with self.assertRaises(OSError):
            self.run_open(wt, "93.184.216.34", V4, "example.com")

    def test_v4_down_v6_still_marked(self):
        wt = all_up(1)
        wt.record("warp0", V4, False)
        wt.record("warp0", V4, False)
        _result, marked, direct = self.run_open(wt, "2606:4700::1", V6, "example.com")
        self.assertEqual((marked[0][3], direct), (0x7701, []))

    def test_failed_connect_through_healthy_tunnel_does_not_go_direct(self):
        wt = all_up()
        with self.assertRaises(ConnectionRefusedError):
            self.run_open(wt, "93.184.216.34", V4, "example.com", fallback=True,
                          marked_error=ConnectionRefusedError("refused"))

    def test_dial_keys_by_site(self):
        wt = all_up()
        marks = []

        async def fake_marked(addr, port, fam, mark, **kw):
            marks.append(mark)
            return "mr", "mw"

        async def go():
            loop = asyncio.get_event_loop()
            infos = [_info(V4, "93.184.216.34")]
            with mock.patch.object(loop, "getaddrinfo", mock.AsyncMock(return_value=infos)), \
                    mock.patch.object(er, "open_marked", fake_marked):
                for host in ("www.example.co.uk", "static.cdn.example.co.uk", "example.co.uk."):
                    await er.dial({"warp": None, "warp_kernel": wt}, er.FamilyPins(), host, 443)

        asyncio.run(go())
        self.assertEqual(marks, [wt.pick("example.co.uk", V4).mark] * 3)

    def test_literal_stream_keys_by_ip(self):
        seen = []

        async def fake_open_clean(cfg, ip, port, family, key=None, bypass=False):
            seen.append((ip, port, family, key))
            r = asyncio.StreamReader()
            r.feed_eof()
            return r, mock.Mock(drain=mock.AsyncMock())

        async def go():
            reader = asyncio.StreamReader()
            reader.feed_data(b"\x05\x01\x00" + b"\x05\x01\x00\x04"
                             + socket.inet_pton(V6, "2606:4700::1") + (443).to_bytes(2, "big"))
            reader.feed_eof()
            writer = mock.Mock(drain=mock.AsyncMock())
            with mock.patch.object(er, "open_clean", fake_open_clean):
                await er.handle({"warp": None, "warp_kernel": all_up()}, None, er.FamilyPins(), reader, writer)
            return writer

        writer = asyncio.run(go())
        self.assertEqual(seen, [("2606:4700::1", 443, V6, "2606:4700::1")])
        self.assertIn(mock.call(b"\x05\x00\x00\x01" + bytes(6)), writer.write.call_args_list)


class TunnelProbe(unittest.TestCase):
    def run_probe(self, family, feed, eof=True):
        calls = []
        writer = mock.Mock(drain=mock.AsyncMock())

        async def fake_marked(addr, port, fam, mark, **kw):
            calls.append((addr, port, fam, mark, kw))
            r = asyncio.StreamReader()
            r.feed_data(feed)
            if eof:
                r.feed_eof()
            return r, writer

        wt = er.WarpTunnels(tunnels(1))

        async def go():
            with mock.patch.object(er, "open_marked", fake_marked):
                return await wt.probe(wt.tunnels[0], family)

        return asyncio.run(go()), calls, writer

    def response(self, warp):
        body = "fl=1\nh=1.1.1.1\nip=104.28.1.1\nts=1\nvisit_scheme=https\nwarp=%s\ngateway=off\n" % warp
        return ("HTTP/1.1 200 OK\r\nContent-Type: text/plain\r\nContent-Length: %d\r\n"
                "Connection: close\r\n\r\n%s" % (len(body), body)).encode()

    def test_warp_on_is_healthy(self):
        ok, calls, writer = self.run_probe(V4, self.response("on"))
        self.assertTrue(ok)
        addr, port, fam, mark, kw = calls[0]
        self.assertEqual((addr, port, fam, mark), ("1.1.1.1", 443, V4, 0x7701))
        self.assertEqual(kw["server_hostname"], "1.1.1.1")
        self.assertIsNotNone(kw["ssl"])
        req = writer.write.call_args[0][0]
        self.assertTrue(req.startswith(b"GET /cdn-cgi/trace HTTP/1.1\r\nHost: 1.1.1.1\r\n"), req)
        self.assertIn(b"Connection: close\r\n", req)
        writer.close.assert_called_once()

    def test_warp_plus_is_healthy(self):
        self.assertTrue(self.run_probe(V4, self.response("plus"))[0])

    def test_v6_host_in_brackets(self):
        ok, calls, writer = self.run_probe(V6, self.response("on"))
        self.assertTrue(ok)
        self.assertEqual(calls[0][0], "2606:4700:4700::1111")
        self.assertIn(b"Host: [2606:4700:4700::1111]\r\n", writer.write.call_args[0][0])

    def test_warp_off_is_unhealthy(self):
        ok, _calls, writer = self.run_probe(V4, self.response("off"))
        self.assertFalse(ok)
        writer.close.assert_called_once()

    def test_oversized_body_is_bounded(self):
        # No EOF: the probe must stop at PROBE_READ_MAX rather than wait for more.
        ok, _calls, writer = self.run_probe(V4, b"x" * 20000 + b"\nwarp=on\n", eof=False)
        self.assertFalse(ok)
        writer.close.assert_called_once()

    def test_silent_server_times_out(self):
        with mock.patch.object(er, "PROBE_TIMEOUT", 0.05):
            ok, _calls, writer = self.run_probe(V4, b"", eof=False)
        self.assertFalse(ok)
        writer.close.assert_called_once()

    def test_connect_failure_is_unhealthy(self):
        wt = er.WarpTunnels(tunnels(1))

        async def go():
            with mock.patch.object(er, "open_marked", mock.AsyncMock(side_effect=ConnectionRefusedError())):
                return await wt.probe(wt.tunnels[0], V4)

        self.assertFalse(asyncio.run(go()))


class OpenMarked(unittest.TestCase):
    """A real loopback connect. SO_MARK needs CAP_NET_ADMIN, so that one setsockopt is faked."""

    def setUp(self):
        self.marks = []
        real = socket.socket.setsockopt
        marks = self.marks

        def setsockopt(sock, level, opt, *rest):
            if level == socket.SOL_SOCKET and opt == er.SO_MARK:
                marks.append(rest[0])
                return None
            return real(sock, level, opt, *rest)

        patcher = mock.patch.object(socket.socket, "setsockopt", setsockopt)
        patcher.start()
        self.addCleanup(patcher.stop)

    def test_connects_with_the_mark(self):
        async def echo(r, w):
            w.write(await r.readexactly(5))
            await w.drain()
            w.close()

        async def go():
            server = await asyncio.start_server(echo, "127.0.0.1", 0)
            port = server.sockets[0].getsockname()[1]
            try:
                r, w = await er.open_marked("127.0.0.1", port, V4, 0x7701)
                w.write(b"hello")
                got = await r.readexactly(5)
                w.close()
                return got
            finally:
                server.close()
                await server.wait_closed()

        self.assertEqual(asyncio.run(go()), b"hello")
        self.assertEqual(self.marks, [0x7701])

    def test_socket_closed_on_failure(self):
        made = []
        real_socket = socket.socket

        class Recording(real_socket):
            def __init__(self, *a, **kw):
                super().__init__(*a, **kw)
                made.append(self)

        async def go():
            probe = real_socket()
            probe.bind(("127.0.0.1", 0))
            port = probe.getsockname()[1]
            probe.close()                  # nothing listens there now
            with mock.patch.object(er.socket, "socket", Recording):
                await er.open_marked("127.0.0.1", port, V4, 0x7702)

        with self.assertRaises(OSError):
            asyncio.run(go())
        self.assertEqual(self.marks, [0x7702])
        self.assertEqual(len(made), 1)
        self.assertEqual(made[0].fileno(), -1)


class SharedWarpVectors(unittest.TestCase):
    """holyWisp marks a site's UDP for the tunnel this router picks for its TCP, by the same rules.

    warp_vectors.json is holyWisp's tests/gen_warp_vectors.py --json, the same vectors as its
    tests/warp_vectors.h. A change here that moves a site_key, a score or a pick fails this test:
    change holyWisp with it and regenerate both, or a site's UDP leaves from another exit than its TCP.
    """

    @classmethod
    def setUpClass(cls):
        cls.v = json.loads(Path(__file__).with_name("warp_vectors.json").read_text())

    def test_counts(self):
        self.assertEqual((len(self.v["site_key"]), len(self.v["score"]), len(self.v["pick"])), (40, 468, 156))

    def test_site_key(self):
        for host, key in self.v["site_key"]:
            self.assertEqual(er.site_key(host), key, host)

    def test_score(self):
        for key, name, score in self.v["score"]:
            self.assertEqual(er.rendezvous_score(key, name), score, (key, name))

    def test_pick(self):
        for ti, tunnels in enumerate(self.v["tunnel_sets"]):
            wt = er.WarpTunnels([er.WarpTunnel(n, 0x7701 + i) for i, n in enumerate(tunnels)])
            for n in tunnels:
                wt.up[(n, socket.AF_INET)] = True
            for set_index, key, name in self.v["pick"]:
                if set_index == ti:
                    self.assertEqual(wt.pick(key, socket.AF_INET).name, name, (ti, key))


class WarpState(unittest.TestCase):
    """warp.json, what holyWisp's udp-warp-state reads."""

    def setUp(self):
        self.dir = tempfile.TemporaryDirectory()
        self.path = os.path.join(self.dir.name, "warp.json")
        self.wt = er.WarpTunnels([er.WarpTunnel("warp0", 0x7701), er.WarpTunnel("warp1", 0x7702),
                                  er.WarpTunnel("warp2", 0x7703)], state_path=self.path)

    def tearDown(self):
        self.dir.cleanup()

    def read(self):
        return json.loads(Path(self.path).read_text())

    def test_lists_only_tunnels_up_per_family(self):
        self.wt.record("warp0", socket.AF_INET, True)
        self.wt.record("warp1", socket.AF_INET, False)
        self.wt.record("warp2", socket.AF_INET, True)
        self.wt.record("warp1", socket.AF_INET6, True)
        self.wt.write_state()
        self.assertEqual(self.read(), {"v4": [{"name": "warp0", "mark": 0x7701}, {"name": "warp2", "mark": 0x7703}],
                                       "v6": [{"name": "warp1", "mark": 0x7702}]})
        self.assertEqual(os.stat(self.path).st_mode & 0o777, 0o640)
        self.assertEqual(os.listdir(self.dir.name), ["warp.json"])      # no temp file left behind

    def test_marks_are_plain_integers(self):
        self.wt.record("warp0", socket.AF_INET, True)
        self.wt.write_state()
        self.assertRegex(Path(self.path).read_text(), r'"mark":30465[,}]')

    def test_rewritten_every_probe_round_even_without_a_change(self):
        async def ok(_t, _f):
            return True

        with mock.patch.object(self.wt, "probe", ok):
            asyncio.run(self.wt.probe_all())
            first = os.stat(self.path).st_mtime_ns
            os.utime(self.path, ns=(first - 10**10, first - 10**10))      # as if 10 s old
            asyncio.run(self.wt.probe_all())
        self.assertGreater(os.stat(self.path).st_mtime_ns, first - 10**10)
        self.assertEqual(len(self.read()["v4"]), 3)

    def test_all_down_writes_empty_families(self):
        async def bad(_t, _f):
            return False

        with mock.patch.object(self.wt, "probe", bad):
            asyncio.run(self.wt.probe_all())
        self.assertEqual(self.read(), {"v4": [], "v6": []})

    def test_unwritable_path_does_not_raise(self):
        wt = er.WarpTunnels([er.WarpTunnel("warp0", 0x7701)], state_path=os.path.join(self.dir.name, "no", "x.json"))
        wt.write_state()          # logs, never raises: holyWisp falls back by itself

    def test_no_path_writes_nothing(self):
        er.WarpTunnels([er.WarpTunnel("warp0", 0x7701)]).write_state()
        self.assertEqual(os.listdir(self.dir.name), [])

    def test_config_default_and_off(self):
        base = {"doh_adult": "a", "doh_shady": "b", "doh_plain": "c", "relay_host": "1.2.3.4", "relay_port": 1,
                "relay_user": "u", "relay_pass": "p", "warp_tunnels": [{"name": "warp0", "mark": 30465}]}
        for extra, want in (({}, er.WARP_STATE_PATH), ({"warp_state": ""}, None), ({"warp_state": "/x/y.json"}, "/x/y.json")):
            with mock.patch.object(er, "CONFIG_PATH", mock.Mock(read_text=lambda: json.dumps(dict(base, **extra)))):
                self.assertEqual(er.load_config()["warp_kernel"].state_path, want, extra)


class ClientKey(unittest.TestCase):
    """holyWisp's per-client key (proxy-client-key) as the SOCKS5 username, and the pick it drives."""

    KEY = "91a987e9ff5ccbd5"      # holyWisp: secret "namespace-secret-0", client 127.0.0.1

    def test_key_derivation_matches_holywisp(self):
        # holyWisp's side, restated: BLAKE2b-64 over secret + NUL + the client's address bytes.
        self.assertEqual(hashlib.blake2b(b"namespace-secret-0\0" + bytes([127, 0, 0, 1]), digest_size=8).hexdigest(),
                         self.KEY)

    def test_shared_pick_vector(self):
        wt = er.WarpTunnels([er.WarpTunnel("warp%d" % i, 0x7701 + i) for i in range(4)])
        for i in range(4):
            wt.up[("warp%d" % i, socket.AF_INET)] = True
        self.assertEqual(wt.pick("127.0.0.1", socket.AF_INET).name, "warp0")
        self.assertEqual(wt.pick(er.warp_key(self.KEY, "127.0.0.1"), socket.AF_INET).name, "warp2")

    def test_only_16_lower_hex_counts(self):
        self.assertEqual(er.client_key(self.KEY.encode()), self.KEY)
        for bad in (b"", b"91A987E9FF5CCBD5", b"91a987e9ff5ccbd", b"91a987e9ff5ccbd5a", b"91a987e9ff5ccbdg",
                    b"91a987e9ff5ccbd5\n", b"../../etc/passwd", b"\xff" * 16, b"91a987e9 f5ccbd5"):
            self.assertIsNone(er.client_key(bad), bad)

    def test_tunnel_name_with_a_trailing_newline_is_refused(self):
        with self.assertRaises(SystemExit):
            er.warp_tunnels([{"name": "warp0\n", "mark": 30465}])

    def test_warp_key(self):
        self.assertEqual(er.warp_key(None, "example.com"), "example.com")
        self.assertEqual(er.warp_key(self.KEY, "example.com"), self.KEY + "/example.com")

    def converse(self, greeting, auth=None, dest=(3, b"www.example.com")):
        """One SOCKS5 exchange with handle(); the clean connect is faked and records its key."""
        keys = []

        async def fake_open_clean(cfg, ip, port, family, key=None, bypass=False):
            keys.append(key)
            raise OSError("faked")

        class Clf:
            async def verdict(self, host):
                return er.CLEAN

        async def go():
            loop = asyncio.get_event_loop()
            infos = [(socket.AF_INET, socket.SOCK_STREAM, 6, "", ("1.1.1.1", 443))]
            server = await asyncio.start_server(
                lambda r, w: er.handle({"warp": None}, Clf(), er.FamilyPins(), r, w), "127.0.0.1", 0)
            port = server.sockets[0].getsockname()[1]
            out = []
            with mock.patch.object(er, "open_clean", fake_open_clean), \
                    mock.patch.object(loop, "getaddrinfo", mock.AsyncMock(return_value=infos)):
                r, w = await asyncio.open_connection("127.0.0.1", port)
                w.write(greeting)
                out.append(await r.readexactly(2))
                if auth is not None and out[0] == b"\x05\x02":
                    w.write(auth)
                    out.append(await r.readexactly(2))
                    if out[-1] != b"\x01\x00":
                        w.close()
                        server.close()
                        return out, keys
                if out[0][1] != 0xFF:
                    atyp, raw = dest
                    addr = bytes([len(raw)]) + raw if atyp == 3 else raw
                    w.write(b"\x05\x01\x00" + bytes([atyp]) + addr + (443).to_bytes(2, "big"))
                    out.append(await r.readexactly(10))
                w.close()
            server.close()
            await server.wait_closed()
            return out, keys

        return asyncio.run(go())

    @staticmethod
    def rfc1929(user, password=b""):
        return b"\x01" + bytes([len(user)]) + user + bytes([len(password)]) + password

    def test_no_auth_offer_keeps_the_site_key(self):
        out, keys = self.converse(b"\x05\x01\x00")
        self.assertEqual(out[0], b"\x05\x00")
        self.assertEqual(out[1][1], er.REP_UNREACH)          # the faked connect failed, as planned
        self.assertEqual(keys, ["example.com"])

    def test_key_as_username_is_used(self):
        out, keys = self.converse(b"\x05\x02\x00\x02", self.rfc1929(self.KEY.encode()))
        self.assertEqual(out[:2], [b"\x05\x02", b"\x01\x00"])
        self.assertEqual(keys, [self.KEY + "/example.com"])

    def test_key_with_a_password_is_used(self):
        out, keys = self.converse(b"\x05\x02\x00\x02", self.rfc1929(self.KEY.encode(), b"whatever"))
        self.assertEqual(keys, [self.KEY + "/example.com"])

    def test_literal_ip_uses_key_and_address(self):
        out, keys = self.converse(b"\x05\x02\x00\x02", self.rfc1929(self.KEY.encode()),
                                  dest=(1, socket.inet_aton("1.1.1.1")))
        self.assertEqual(keys, [self.KEY + "/1.1.1.1"])

    def test_malformed_username_is_ignored(self):
        out, keys = self.converse(b"\x05\x02\x00\x02", self.rfc1929(b"EVIL/../../x"))
        self.assertEqual(out[1], b"\x01\x00")                 # accepted, but the name means nothing
        self.assertEqual(keys, ["example.com"])

    def test_bad_auth_version_is_refused(self):
        out, keys = self.converse(b"\x05\x01\x02", b"\x05\x00\x00")
        self.assertEqual(out[1], b"\x01\x01")
        self.assertEqual(keys, [])

    def test_no_usable_method(self):
        out, keys = self.converse(b"\x05\x01\x01")
        self.assertEqual(out, [b"\x05\xff"])



class GateRouting(unittest.TestCase):
    """What the name gate answers with the sink: shady names, and adult ones with gate_adult."""

    class Clf:
        verdicts = {"shady.example": er.SHADY, "adult.example": er.ADULT, "clean.example": er.CLEAN}

        async def verdict(self, host):
            return self.verdicts[host]

    def routed(self, adult, name):
        gate = er.NameGate(self.Clf(), er.FamilyPins(), er.gate_sink("192.0.2.1"), [], adult=adult)
        return asyncio.run(gate.routed(name))

    def test_shady_only_by_default(self):
        self.assertTrue(self.routed(False, "shady.example"))
        self.assertFalse(self.routed(False, "adult.example"))
        self.assertFalse(self.routed(False, "clean.example"))

    def test_adult_too_when_holywisp_dials_clean_tcp(self):
        self.assertTrue(self.routed(True, "shady.example"))
        self.assertTrue(self.routed(True, "adult.example"))
        self.assertFalse(self.routed(True, "clean.example"))

    def test_no_verdict_is_the_routers_when_holywisp_dials_tcp(self):
        class Slow:
            async def verdict(self, host):
                await asyncio.sleep(5)

        class Broken:
            async def verdict(self, host):
                raise RuntimeError("doh down")

        for clf in (Slow(), Broken()):
            for adult in (False, True):
                gate = er.NameGate(clf, er.FamilyPins(), er.gate_sink("192.0.2.1"), [], adult=adult)
                with mock.patch.object(er, "GATE_VERDICT_TIMEOUT", 0.05):
                    self.assertEqual(asyncio.run(gate.routed("slow.example")), adult)

    def test_sink_answer(self):
        query = b"\x12\x34" + er.dns_wire("adult.example")[2:]  # an A question
        gate = er.NameGate(self.Clf(), er.FamilyPins(), er.gate_sink("192.0.2.1"), [], adult=True)
        sent = []
        gate.transport = type("T", (), {"sendto": lambda _self, data, addr: sent.append(data)})()
        asyncio.run(gate.answer(query, ("127.0.0.1", 5353)))
        self.assertEqual(len(sent), 1)
        self.assertTrue(sent[0].endswith(socket.inet_aton("192.0.2.1")))


class WarpBypass(unittest.TestCase):
    """warp_bypass: holyWisp's warp-bypass-host patterns, and a bypassed name dials directly."""

    def cfg(self, *patterns):
        return {"warp_bypass": er.warp_bypass(list(patterns))}

    def test_patterns(self):
        cfg = self.cfg("youtube.com", "*.youtube.com", ".reddit.com", " Reddit.COM. ")
        for host in ("youtube.com", "www.youtube.com", "m.YouTube.com.", "a.b.youtube.com", "reddit.com",
                     "old.reddit.com"):
            self.assertTrue(er.bypasses_warp(cfg, host), host)
        for host in ("notyoutube.com", "youtube.com.evil.example", "youtu.be", "redditmedia.com", "com"):
            self.assertFalse(er.bypasses_warp(cfg, host), host)

    def test_subdomains_only(self):
        cfg = self.cfg("*.example.com")
        self.assertTrue(er.bypasses_warp(cfg, "a.example.com"))
        self.assertFalse(er.bypasses_warp(cfg, "example.com"))

    def test_ip_literal_never_bypasses(self):
        cfg = {"warp_bypass": er.warp_bypass(["1.2.3.4", "2001:db8::1"])}
        self.assertFalse(er.bypasses_warp(cfg, "1.2.3.4"))
        self.assertFalse(er.bypasses_warp(cfg, "2001:db8::1"))
        self.assertFalse(er.bypasses_warp(cfg, "[2001:db8::1]"))

    def test_empty_and_absent(self):
        self.assertFalse(er.bypasses_warp({}, "youtube.com"))
        self.assertFalse(er.bypasses_warp(self.cfg(), "youtube.com"))
        # The same refusals as holyWisp's warp-bypass-host (tests/test_config.c there).
        for bad in ("", ".", "*.", "*", "you*tube.com", "*.*.youtube.com", "*youtube.com", "*. ", 7):
            with self.assertRaises(SystemExit):
                er.warp_bypass([bad])

    def test_bypassed_name_dials_directly_with_every_tunnel_down(self):
        tunnels = er.WarpTunnels([er.WarpTunnel("warp0", 0x7701)])  # never probed: down
        cfg = {"warp_kernel": tunnels, "warp_fallback_direct": False, "warp": None,
               "warp_bypass": er.warp_bypass(["*.youtube.com"])}
        opened = []

        async def fake_open(ip, port, family=None):
            opened.append((ip, port))
            return "r", "w"

        with mock.patch.object(er.asyncio, "open_connection", fake_open):
            self.assertEqual(asyncio.run(er.open_clean(cfg, "192.0.2.7", 443, socket.AF_INET, key="k", bypass=True)),
                             ("r", "w"))
            with self.assertRaises(OSError):  # not bypassed: no tunnel, no fallback
                asyncio.run(er.open_clean(cfg, "192.0.2.7", 443, socket.AF_INET, key="k"))
        self.assertEqual(opened, [("192.0.2.7", 443)])

if __name__ == "__main__":
    unittest.main()
