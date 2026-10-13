#!/usr/bin/env python3
"""WebSocket -> local sshd byte bridge for out-of-band admin SSH through the ArvanCloud CDN.

Listens only on the learnbox-edge Docker gateway (never a public interface); Caddy forwards an
authenticated path to it. Carries opaque SSH bytes: SSH key auth and encryption stay end to end.
"""
import asyncio
import sys

import websockets

BIND = sys.argv[1] if len(sys.argv) > 1 else "172.19.0.1"
PORT = 8022


async def handler(ws, _path=None):
    reader, writer = await asyncio.open_connection("127.0.0.1", 22)

    async def ws_to_tcp():
        async for msg in ws:
            writer.write(msg if isinstance(msg, bytes) else msg.encode())
            await writer.drain()

    async def tcp_to_ws():
        while data := await reader.read(65536):
            await ws.send(data)

    tasks = [asyncio.create_task(ws_to_tcp()), asyncio.create_task(tcp_to_ws())]
    await asyncio.wait(tasks, return_when=asyncio.FIRST_COMPLETED)
    for t in tasks:
        t.cancel()
    writer.close()
    await ws.close()


async def main():
    async with websockets.serve(handler, BIND, PORT, max_size=None, ping_interval=20, ping_timeout=40):
        await asyncio.Future()


if __name__ == "__main__":
    asyncio.run(main())
