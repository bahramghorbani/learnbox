#!/bin/sh
# Self-check for the Sibapp purchase logic (no simulator/device needed).
set -e
cd "$(dirname "$0")"
out="${TMPDIR:-/tmp}/learnbox-ios-check"
xcrun swiftc -o "$out" LearnBox/SibappPurchase.swift Checks/main.swift
"$out"
