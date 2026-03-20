# Loki Log Aggregation for n8n + Twenty CRM

This directory contains the configuration and deployment files for Grafana Loki log aggregation.

## Overview

Loki provides centralized log aggregation with efficient label-based indexing, allowing you to:
- Search across all n8n workflow executions
- Correlate logs with Prometheus metrics
- Set up log-based alerting
- Reduce MTTR with faster root cause analysis

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        Log Flow                                  │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│  n8n Container ──▶ Docker Logs ──▶ Promtail ──▶ Grafana Cloud   │
│       │                                              Loki         │
│       │                                  │                        │
│       ▼                                  ▼                        │
│  Structured JSON                    Grafana UI                    │
│  Logs                               (Explore/Dashboards)          │
│                                                                   │
└─────────────────────────────────────────────────────────────────┘
```

## Quick Start

### 1. Get Grafana Cloud Credentials

1. Sign up at https://grafana.com/products/cloud/
2. Navigate to your stack: https://grafana.com/orgs/<org>/stacks/<stack>
3. Get your Loki credentials:
   - **URL**: `logs-prod-us-central1.grafana.net`
   - **User**: Numeric user ID from Loki datasource settings
   - **Token**: Create an API key with 'MetricsPublisher' role

### 2. Configure Environment Variables

```bash
cp .env.loki.example .env.loki
# Edit .env.loki with your credentials
```

### 3. Deploy Promtail

**Option A: Systemd Service (Recommended for VMs)**

```bash
# Set environment variables
export GRAFANA_CLOUD_LOKI_HOST=logs-prod-us-central1.grafana.net
export GRAFANA_CLOUD_LOKI_USER=123456
export GRAFANA_CLOUD_API_KEY=glc_ey...

# Run installation script
sudo ./scripts/install-promtail.sh
```

**Option B: Docker Compose**

```bash
docker-compose -f docker-compose.loki.yml up -d
```

### 4. Verify Installation

```bash
# Check Promtail status
sudo systemctl status promtail

# View Promtail logs
sudo journalctl -u promtail -f

# Run test script
./scripts/test-logging.sh
```

### 5. Explore Logs in Grafana

1. Go to your Grafana Cloud instance
2. Navigate to **Explore** (compass icon)
3. Select the **Loki** data source
4. Try these queries:
   ```logql
   # All n8n logs
   {service="n8n"}
   
   # Recent errors
   {service="n8n", level="error"}
   
   # Specific workflow
   {service="n8n", workflow_name="consultation-form"}
   ```

## Configuration Files

| File | Purpose |
|------|---------|
| `config/promtail.yml` | Promtail agent configuration |
| `config/loki-selfhosted.yml` | Self-hosted Loki server config (reference) |
| `config/alert-rules-loki.yml` | Log-based alert rules |
| `dashboards/n8n-logs-dashboard.json` | Grafana dashboard with logs + metrics |
| `docker-compose.loki.yml` | Docker Compose deployment |
| `.env.loki.example` | Environment variable template |

## Scripts

| Script | Purpose |
|--------|---------|
| `scripts/install-promtail.sh` | Install Promtail as systemd service |
| `scripts/uninstall-promtail.sh` | Remove Promtail installation |
| `scripts/test-logging.sh` | Test the logging pipeline |

## Common LogQL Queries

### Basic Queries

```logql
# All n8n logs
{service="n8n"}

# Errors only
{service="n8n", level="error"}

# Specific workflow
{service="n8n", workflow_name="consultation-form"}
```

### Advanced Filtering

```logql
# Contains string
{service="n8n"} |= "execution failed"

# Regex match
{service="n8n"} |~ "(error|failed|timeout)"

# JSON parsing
{service="n8n"} 
  | json 
  | workflow_name="consultation-form"
  | status="failed"
```

### Metric Queries

```logql
# Error rate
sum(rate({service="n8n", level="error"}[5m]))

# Errors by workflow
sum by (workflow_name) (
  rate({service="n8n", level="error"} | json workflow_name [5m])
)
```

## Alerting

Alert rules are defined in `config/alert-rules-loki.yml`. To import into Grafana Cloud:

1. Go to **Alerting > Alert Rules**
2. Click **New Alert Rule**
3. Import from YAML or create manually using the LogQL expressions

Key alerts:
- **N8nHighErrorRate**: Error rate exceeds 5%
- **N8nWebhookFailures**: Webhook processing errors
- **CRMIntegrationFailures**: CRM API errors
- **UnusualLogVolume**: Potential security issue

## Troubleshooting

### No logs appearing

1. Check Promtail status:
   ```bash
   sudo systemctl status promtail
   sudo journalctl -u promtail -f
   ```

2. Verify API credentials:
   ```bash
   curl -u "${GRAFANA_CLOUD_LOKI_USER}:${GRAFANA_CLOUD_API_KEY}" \
     "https://${GRAFANA_CLOUD_LOKI_HOST}/loki/api/v1/label/service/values"
   ```

3. Test configuration:
   ```bash
   sudo promtail -config.file=/etc/promtail/promtail.yml -dry-run
   ```

### High memory usage

- Reduce `batchsize` in promtail.yml
- Add more label filters to drop unnecessary logs
- Enable sampling for high-volume logs

### Duplicate logs

- Ensure only one Promtail instance is running
- Check positions file is writable
- Verify no other log shippers are active

## Security Considerations

1. **API Key Protection**: Never commit API keys to version control
2. **Network Security**: Promtail uses TLS by default
3. **Log Data**: Avoid logging sensitive data (PII, credentials)
4. **Access Control**: Use Grafana's RBAC for log access

## Cost Optimization

1. **Log Sampling**: Drop debug logs in production
2. **Retention Tiers**: Use shorter retention for less critical logs
3. **Label Cardinality**: Keep label values bounded
4. **Filtering**: Filter at Promtail, not in Loki

## Migration Path

```
Current: Grafana Cloud Loki (Managed)
    │
    ▼
Future: Self-hosted Loki on GKE
  - If monthly costs exceed $500
  - If data residency requirements change
  - If custom retention needed
```

## References

- [Grafana Loki Documentation](https://grafana.com/docs/loki/latest/)
- [LogQL Query Language](https://grafana.com/docs/loki/latest/logql/)
- [Promtail Configuration](https://grafana.com/docs/loki/latest/clients/promtail/configuration/)
- [Grafana Cloud Pricing](https://grafana.com/pricing/)

## Support

For issues or questions:
1. Check the main research document: `PHASE2_LOG_AGGREGATION_RESEARCH.md`
2. Review Grafana Loki documentation
3. Contact the SRE team
