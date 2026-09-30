#!/usr/bin/env python3
"""Reads newline-separated passwords on STDIN, prints one PostgreSQL SCRAM-SHA-256 verifier per line.
The verifier is what `ALTER ROLE .. PASSWORD '<verifier>'` stores, so the plaintext password
never has to reach the database server or its logs. Stdlib only."""
import base64, hashlib, hmac, os, sys

ITER = 4096


def verifier(password: str) -> str:
    salt = os.urandom(16)
    salted = hashlib.pbkdf2_hmac('sha256', password.encode('utf-8'), salt, ITER)
    client_key = hmac.new(salted, b'Client Key', hashlib.sha256).digest()
    stored_key = hashlib.sha256(client_key).digest()
    server_key = hmac.new(salted, b'Server Key', hashlib.sha256).digest()
    b64 = lambda b: base64.b64encode(b).decode('ascii')
    return f'SCRAM-SHA-256${ITER}:{b64(salt)}${b64(stored_key)}:{b64(server_key)}'


if __name__ == '__main__':
    for line in sys.stdin.read().split('\n'):
        if line:
            print(verifier(line))
