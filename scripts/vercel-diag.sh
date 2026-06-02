#!/usr/bin/env bash
# TEMP Vercel build diagnostic (runs via the "preverify" npm hook, before the gate).
# Captures why `prettier --check` flags vercel.json on Vercel but not locally/CI.
# REMOVE this file and the "preverify" script once the root cause is known.
set +e
echo "===== VERCEL_DIAG_START ====="
echo "node:     $(node -v 2>&1)"
echo "npm:      $(npm -v 2>&1)"
echo "prettier: $(npx --no-install prettier --version 2>&1)"
echo "cwd:      $(pwd)"
echo "--- git view of vercel.json (is .gitattributes applied on this checkout?) ---"
git ls-files --eol vercel.json 2>&1
git check-attr -a vercel.json 2>&1
echo "--- vercel.json byte facts ---"
echo "byteLength=$(wc -c < vercel.json 2>&1 | tr -d ' ')"
echo "crBytes=$(tr -cd '\r' < vercel.json 2>/dev/null | wc -c | tr -d ' ')"
echo "lfBytes=$(tr -cd '\n' < vercel.json 2>/dev/null | wc -c | tr -d ' ')"
if [ -z "$(tail -c 1 vercel.json 2>/dev/null)" ]; then echo "trailingNewline=yes"; else echo "trailingNewline=no"; fi
printf 'first3BytesHex='; head -c 3 vercel.json 2>/dev/null | od -An -tx1 | tr -d ' \n'; echo
echo "head(od -c):"; head -c 48 vercel.json 2>/dev/null | od -c
echo "tail(od -c):"; tail -c 24 vercel.json 2>/dev/null | od -c
echo "--- prettier --check vercel.json ---"
npx --no-install prettier --check vercel.json 2>&1
echo "--- unified diff: on-disk (---) vs prettier output (+++) ---"
npx --no-install prettier vercel.json 2>/dev/null | diff -u vercel.json - 2>&1 | head -40
echo "===== VERCEL_DIAG_END ====="
exit 0
