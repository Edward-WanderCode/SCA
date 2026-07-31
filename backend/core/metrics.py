"""
Prometheus metrics configuration.
"""

from prometheus_client import Counter, Histogram, Gauge

# Scanner Metrics
scan_duration_seconds = Histogram(
    'sca_scan_duration_seconds',
    'Time spent running a scan',
    ['scan_type', 'status']
)

scan_findings_total = Counter(
    'sca_scan_findings_total',
    'Total number of findings discovered',
    ['scan_type', 'severity']
)

scan_total = Counter(
    'sca_scan_total',
    'Total number of scans executed',
    ['scan_type', 'status']
)

# API Metrics
api_requests_total = Counter(
    'sca_api_requests_total',
    'Total number of API requests',
    ['method', 'endpoint', 'status']
)

api_request_latency = Histogram(
    'sca_api_request_latency_seconds',
    'API Request Latency',
    ['method', 'endpoint']
)

# Resource Metrics
celery_queue_length = Gauge(
    'sca_celery_queue_length',
    'Number of pending tasks in Celery queue'
)
