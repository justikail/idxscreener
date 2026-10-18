#!/usr/bin/env bash
# Supervisor sederhana untuk pengembangan lokal: jalankan ulang worker setiap
# kali keluar (mis. watchdog mendeteksi database menggantung). Di hosting,
# pakai systemd/pm2/container restart policy, bukan skrip ini.
# Berhenti dengan Ctrl+C (SIGINT diteruskan ke worker lalu loop keluar).
trap 'exit 0' INT TERM
while true; do
  pnpm --silent worker
  code=$?
  echo "$(date -u +%FT%TZ) worker keluar (kode $code); dijalankan ulang dalam 10 detik."
  sleep 10
done
