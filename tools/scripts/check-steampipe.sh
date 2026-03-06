#!/bin/bash
# Quick Steampipe health check
echo "=== Steampipe Status ==="
steampipe service status --show-password 2>&1 | grep -E "Port|Password|running"

echo ""
echo "=== Plugin Versions ==="
steampipe plugin list

echo ""
echo "=== Quick Query Test ==="
steampipe query "SELECT 'EC2' as svc, COUNT(*) as cnt FROM aws_ec2_instance UNION ALL SELECT 'VPC', COUNT(*) FROM aws_vpc UNION ALL SELECT 'K8s Pods', COUNT(*) FROM kubernetes_pod" --output json --input=false 2>&1 | python3 -c "
import json, sys
try:
    d = json.load(sys.stdin)
    for r in d.get('rows', []): print(f'  {r[\"svc\"]}: {r[\"cnt\"]}')
except: print('  Query failed')
"
