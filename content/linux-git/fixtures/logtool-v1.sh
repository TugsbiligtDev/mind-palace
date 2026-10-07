# Capstone 2, after step 1: ~/log-tool/logsum.sh, the log summary tool, and ShellCheck installed.
apt-get install -y -q shellcheck > /dev/null
mkdir -p ~/log-tool
cat > ~/log-tool/logsum.sh <<'SH'
#!/usr/bin/env bash
# logsum.sh: summarise an nginx access log
set -euo pipefail
if [[ $# -ne 1 ]]; then
  echo "usage: logsum.sh ACCESS_LOG" >&2
  exit 2
fi
log=$1
if [[ ! -r "$log" ]]; then
  echo "logsum.sh: cannot read $log" >&2
  exit 1
fi
echo "Requests: $(wc -l < "$log")"
echo "Visitors: $(cut -d' ' -f1 "$log" | sort -u | wc -l)"
echo "Errors: $(awk '$9 >= 400' "$log" | wc -l)"
echo "Top pages:"
awk '{print $7}' "$log" | sort | uniq -c | sort -k1,1nr -k2,2 | head -3 | awk '{print "  " $1, $2}'
SH
chmod +x ~/log-tool/logsum.sh
