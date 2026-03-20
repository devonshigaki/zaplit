# LogQL Queries for n8n + Twenty CRM Monitoring

This document contains common LogQL queries for analyzing logs in Grafana Loki.

## Table of Contents

1. [Basic Queries](#basic-queries)
2. [Error Analysis](#error-analysis)
3. [Workflow-Specific Queries](#workflow-specific-queries)
4. [Performance & Latency](#performance--latency)
5. [Infrastructure Monitoring](#infrastructure-monitoring)
6. [Circuit Breaker & DLQ](#circuit-breaker--dlq)
7. [Security & Compliance](#security--compliance)
8. [Metric Queries](#metric-queries)

---

## Basic Queries

### All n8n Logs
```logql
{service="n8n"}
```

### All Error Logs
```logql
{level="error"}
```

### n8n Errors Only
```logql
{service="n8n", level="error"}
```

### Specific Workflow
```logql
{service="n8n", workflow_name="consultation-form"}
```

### Multiple Services
```logql
{service=~"n8n|twenty-crm"}
```

### Filter by Time Range
```logql
{service="n8n"}[5m]
```

---

## Error Analysis

### Error Rate by Workflow (Top 10)
```logql
topk(10, sum by (workflow_name) (
  rate({service="n8n", level="error"}[5m])
))
```

### Error Messages Count
```logql
sum by (msg) (
  rate({service="n8n", level="error"} | json msg [5m])
)
```

### Recent Errors with Context
```logql
{service="n8n", level="error"}
  | json
  | line_format "{{.ts}} | {{.workflowName}} | {{.msg}}"
```

### Errors by Node Type
```logql
sum by (node_type) (
  rate({service="n8n", level="error"} | json node_type [5m])
)
```

### Error Trend Over Time
```logql
sum(rate({service="n8n", level="error"}[5m]))
```

### Failed Executions Details
```logql
{service="n8n"} 
  |~ "execution.*failed|workflow.*error"
  | json
  | line_format "{{.ts}} | {{.workflowName}} | {{.executionId}} | {{.msg}}"
```

---

## Workflow-Specific Queries

### Consultation Form Logs
```logql
{service="n8n", workflow_name="consultation-form"}
```

### Consultation Form Errors
```logql
{service="n8n", workflow_name="consultation-form", level="error"}
  | json
  | line_format "{{.ts}} | Node: {{.node}} | {{.msg}}"
```

### Demo Booking Workflow
```logql
{service="n8n", workflow_name="book-demo"}
```

### Webhook Triggered Workflows
```logql
{service="n8n"} 
  | json
  | msg=~"webhook.*received|webhook.*triggered"
  | line_format "{{.ts}} | {{.workflowName}} | {{.msg}}"
```

### Workflow Execution Count by Name
```logql
sum by (workflow_name) (
  rate({service="n8n"} | json workflow_name [5m])
)
```

---

## Performance & Latency

### Latency by Node (from n8n logs)
```logql
{service="n8n"}
  | json
  | duration_ms != ""
  | line_format "{{.ts}} | {{.workflowName}} | {{.node}} | {{.duration_ms}}ms"
```

### Slow Webhook Responses (> 5s)
```logql
{service="nginx"} 
  | json
  | path=~"/webhook.*"
  | request_time > 5
  | line_format "{{.timestamp}} | {{.path}} | {{.request_time}}s | {{.status}}"
```

### p95 Response Time from Nginx
```logql
histogram_quantile(0.95,
  sum(rate({service="nginx"} | json | unwrap request_time [5m])) by (le)
)
```

### p99 Response Time from Nginx
```logql
histogram_quantile(0.99,
  sum(rate({service="nginx"} | json | unwrap request_time [5m])) by (le)
)
```

### Average Response Time by Path
```logql
avg by (path) (
  sum(rate({service="nginx"} | json | unwrap request_time [5m]))
)
```

### Slow Database Queries
```logql
{service="n8n"} 
  |~ "query.*took|slow query|timeout"
  | json
```

---

## Infrastructure Monitoring

### System Logs
```logql
{service="system"}
```

### Out of Memory Events
```logql
{service="system"} 
  |~ "Out of memory|OOM|killed process"
```

### Disk Space Issues
```logql
{service="system"} 
  |~ "No space left on device|disk full"
```

### Docker Container Events
```logql
{service="system", service_name="docker"}
```

### SSH Login Attempts
```logql
{service="auth"} 
  |~ "sshd|ssh"
```

### Failed SSH Attempts (Security)
```logql
{service="auth"} 
  |~ "Failed password|Invalid user"
```

### Systemd Service Failures
```logql
{job="journald", level=~"err|error"}
```

### Nginx Error Rate
```logql
sum(rate({service="nginx", log_type="error"}[5m]))
```

---

## Circuit Breaker & DLQ

### Circuit Breaker Activation Events
```logql
{service="n8n"} 
  |~ "circuit breaker|circuit_breaker|CircuitBreaker"
  | json
  | line_format "{{.ts}} | {{.workflowName}} | CIRCUIT BREAKER: {{.msg}}"
```

### DLQ Operations
```logql
{service="n8n"} 
  |~ "dlq|DLQ|dead.?letter|retry.?queue"
  | json
  | line_format "{{.ts}} | {{.workflowName}} | DLQ: {{.msg}}"
```

### Retry Attempts
```logql
{service="n8n"} 
  |~ "retry|attempt.*\d|will.*retry"
  | json
  | line_format "{{.ts}} | {{.workflowName}} | Attempt: {{.attempt}} | {{.msg}}"
```

### Failed After Max Retries
```logql
{service="n8n"} 
  |~ "max.*retry.*exceeded|failed.*after.*retry"
  | json
  | line_format "{{.ts}} | {{.workflowName}} | MAX RETRIES: {{.msg}}"
```

### Queue Depth/Backlog (if logged)
```logql
{service="n8n"} 
  |~ "queue.*depth|backlog|queue.*size"
  | json
  | line_format "{{.ts}} | Queue: {{.queueName}} | Depth: {{.depth}}"
```

### Rate Limiting Events
```logql
{service="n8n"} 
  |~ "rate.*limit|throttl|429|too.*many.*request"
  | json
```

### External API Failures (CRM, etc.)
```logql
{service="n8n"} 
  | json
  | msg=~"CRM.*(failed|error|timeout)|twenty.*(failed|error)"
  | line_format "{{.ts}} | {{.workflowName}} | API FAIL: {{.msg}}"
```

---

## Security & Compliance

### Nginx 404 Errors (Potential Scanning)
```logql
{service="nginx"} 
  | json
  | status="404"
  | line_format "{{.timestamp}} | {{.remote_addr}} | {{.path}} | {{.http_user_agent}}"
```

### High 404 Rate by IP
```logql
topk(10, sum by (remote_addr) (
  rate({service="nginx"} | json | status="404" [5m])
))
```

### Suspicious User Agents
```logql
{service="nginx"} 
  | json
  | http_user_agent=~"(?i)(scanner|bot|crawler|nikto|nmap|sqlmap)"
```

### Authentication Failures
```logql
{service="n8n"} 
  |~ "authentication.*failed|login.*failed|unauthorized"
  | json
```

### Privilege Escalation Attempts
```logql
{service="auth"} 
  |~ "sudo|su -|elevated"
```

---

## Metric Queries

### Log Volume by Service
```logql
sum(rate({}[1m])) by (service)
```

### Log Volume Over Time
```logql
sum(bytes_rate({}[5m]))
```

### Top 5 Services by Log Volume
```logql
topk(5, sum(bytes_rate({}[5m])) by (service))
```

### Error Rate Percentage
```logql
(
  sum(rate({level="error"}[5m]))
  /
  sum(rate({}[5m]))
) * 100
```

### Unique Workflows Active
```logql
count by (workflow_name) (
  rate({service="n8n"}[5m])
)
```

### Log Ingestion Rate (lines per second)
```logql
sum(rate({}[1m]))
```

---

## Advanced Queries

### Correlate n8n and Nginx Logs by Trace ID
```logql
{service=~"n8n|nginx"} 
  | json
  | trace_id="${TRACE_ID}"
```

### Find Related Logs Around an Error
```logql
{service="n8n", workflow_name="consultation-form"}
  | json
  | ts > "${ERROR_TIME_MINUS_5M}"
  | ts < "${ERROR_TIME_PLUS_5M}"
```

### Parse Custom Format Logs
```logql
{service="custom"}
  | pattern "<_> level=<level> component=<component> <msg>"
  | level="error"
```

### Extract and Filter JSON Fields
```logql
{service="n8n"}
  | json workflowId="workflow.id", executionId="execution.id", customField="metadata.custom"
  | customField="important"
```

### Multi-stage Pipeline
```logql
{service="n8n"}
  | json
  | workflow_name="consultation-form"
  | level="error"
  | msg=~"CRM|twenty"
  | line_format "{{.ts}} | {{.executionId}} | {{.msg}}"
```

---

## Dashboard Variables Queries

### Service Names for Dropdown
```logql
label_values(service)
```

### Workflow Names for Dropdown
```logql
label_values(workflow_name)
```

### Status Codes for Dropdown
```logql
label_values(status)
```

---

## Tips & Best Practices

1. **Use labels for filtering first** - Label matchers are more efficient than line filters
2. **Limit time range** - Use smaller time ranges for faster queries
3. **Use JSON parsing for structured logs** - More reliable than regex
4. **Avoid high-cardinality labels** - Don't use unique IDs as labels
5. **Use line_format for readability** - Makes logs easier to read in Grafana
6. **Combine with Prometheus metrics** - Use Loki for details, Prometheus for trends

---

## Quick Reference

| Query Type | Example |
|-----------|---------|
| Exact match | `{service="n8n"}` |
| Regex match | `{service=~"n8n|nginx"}` |
| Not equal | `{service!="system"}` |
| Contains | `\|= "error"` |
| Does not contain | `!= "debug"` |
| Regex filter | `\|~ "error\|fail"` |
| Negative regex | `!~ "success"` |
| JSON parse | `\| json` |
| Extract field | `\| json field_name` |
| Line format | `\| line_format "{{.field}}"` |
| Rate | `rate({}[5m])` |
| Count | `count_over_time({}[5m])` |
| Bytes rate | `bytes_rate({}[5m])` |
| TopK | `topk(10, ...)` |
| Quantile | `histogram_quantile(0.95, ...)` |
