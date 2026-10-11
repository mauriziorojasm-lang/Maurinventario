#!/bin/bash
# Renderiza los vídeos de la serie (1080×1920, 30 fps) y normaliza el audio a −15 LUFS.
cd "$(dirname "$0")"
for v in ${@:-v1 v2 v3 v4 v5 v6}; do
  (cd proj/$v && npx --yes hyperframes@0.8.145 render --fps 30 --quality looks --quiet -o ../../render/$v-raw.mp4) || exit 1
  J=$(ffmpeg -hide_banner -i render/$v-raw.mp4 -af loudnorm=I=-15:TP=-1:LRA=11:print_format=json -f null - 2>&1 | sed -n '/^{/,/^}/p')
  g(){ echo "$J" | python3 -c "import json,sys;print(json.load(sys.stdin)['$1'])"; }
  ffmpeg -v error -y -i render/$v-raw.mp4 -c:v copy -af "loudnorm=I=-15:TP=-1:LRA=11:measured_I=$(g input_i):measured_TP=$(g input_tp):measured_LRA=$(g input_lra):measured_thresh=$(g input_thresh):offset=$(g target_offset):linear=true,aresample=48000" -c:a aac -b:a 192k -movflags +faststart render/$v.mp4 && rm render/$v-raw.mp4
  echo "$v listo"
done
