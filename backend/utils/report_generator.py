import html
from datetime import datetime

def generate_html_report(project, scan, findings) -> str:
    """
    Generate a beautiful, standalone HTML report for a security scan.
    """
    # Count severities
    counts = {"critical": 0, "high": 0, "medium": 0, "low": 0, "info": 0}
    for f in findings:
        sev = f.severity.value if hasattr(f.severity, "value") else str(f.severity).lower()
        if sev in counts:
            counts[sev] += 1

    total_findings = len(findings)
    scan_date = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    duration = f"{scan.duration_seconds}s" if scan.duration_seconds else "N/A"
    
    # Sort findings: Critical -> High -> Medium -> Low -> Info
    severity_order = {"critical": 0, "high": 1, "medium": 2, "low": 3, "info": 4}
    sorted_findings = sorted(
        findings,
        key=lambda x: severity_order.get(
            x.severity.value if hasattr(x.severity, "value") else str(x.severity).lower(), 5
        )
    )

    # HTML template with embedded styling
    html_content = f"""<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>SCA Security Report - {html.escape(project.name)}</title>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
    <style>
        :root {{
            --bg-primary: #0b0f19;
            --bg-secondary: #111827;
            --bg-tertiary: #1f2937;
            --border-primary: rgba(255, 255, 255, 0.08);
            --text-primary: #f3f4f6;
            --text-secondary: #9ca3af;
            --text-muted: #6b7280;
            --accent-indigo: #6366f1;
            --accent-critical: #ef4444;
            --accent-high: #f97316;
            --accent-medium: #eab308;
            --accent-low: #3b82f6;
            --accent-info: #6b7280;
        }}

        * {{
            box-sizing: border-box;
            margin: 0;
            padding: 0;
        }}

        body {{
            font-family: 'Inter', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
            background-color: var(--bg-primary);
            color: var(--text-primary);
            line-height: 1.5;
            padding: 40px 20px;
        }}

        .container {{
            max-width: 1100px;
            margin: 0 auto;
        }}

        /* Header section */
        header {{
            background: linear-gradient(135deg, #1e1b4b, #0f172a);
            border: 1px solid var(--border-primary);
            border-radius: 16px;
            padding: 30px;
            margin-bottom: 30px;
            box-shadow: 0 10px 30px rgba(0, 0, 0, 0.5);
            display: flex;
            justify-content: space-between;
            align-items: center;
            flex-wrap: wrap;
            gap: 20px;
        }}

        .header-title h1 {{
            font-size: 1.75rem;
            font-weight: 700;
            background: linear-gradient(to right, #a5b4fc, #818cf8);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
            margin-bottom: 6px;
        }}

        .header-title p {{
            color: var(--text-secondary);
            font-size: 0.875rem;
        }}

        .header-meta {{
            font-size: 0.8125rem;
            color: var(--text-secondary);
            text-align: right;
        }}

        .header-meta-item {{
            margin-bottom: 4px;
        }}

        .header-meta-item strong {{
            color: var(--text-primary);
        }}

        /* Summary Dashboard cards */
        .summary-dashboard {{
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
            gap: 16px;
            margin-bottom: 40px;
        }}

        .summary-card {{
            background-color: var(--bg-secondary);
            border: 1px solid var(--border-primary);
            border-radius: 14px;
            padding: 20px;
            text-align: center;
            transition: transform 200ms ease;
        }}

        .summary-card:hover {{
            transform: translateY(-2px);
        }}

        .summary-card .value {{
            font-size: 2rem;
            font-weight: 700;
            margin-bottom: 4px;
        }}

        .summary-card .label {{
            font-size: 0.75rem;
            font-weight: 600;
            text-transform: uppercase;
            letter-spacing: 0.05em;
            color: var(--text-secondary);
        }}

        /* Severity styling */
        .total-card {{ border-left: 4px solid var(--accent-indigo); }}
        .total-card .value {{ color: #a5b4fc; }}
        .critical-card {{ border-left: 4px solid var(--accent-critical); }}
        .critical-card .value {{ color: var(--accent-critical); }}
        .high-card {{ border-left: 4px solid var(--accent-high); }}
        .high-card .value {{ color: var(--accent-high); }}
        .medium-card {{ border-left: 4px solid var(--accent-medium); }}
        .medium-card .value {{ color: var(--accent-medium); }}
        .low-card {{ border-left: 4px solid var(--accent-low); }}
        .low-card .value {{ color: var(--accent-low); }}

        /* Findings Section */
        h2.section-title {{
            font-size: 1.25rem;
            font-weight: 600;
            margin-bottom: 20px;
            display: flex;
            align-items: center;
            gap: 8px;
        }}

        .findings-list {{
            display: flex;
            flex-direction: column;
            gap: 20px;
        }}

        .finding-item {{
            background-color: var(--bg-secondary);
            border: 1px solid var(--border-primary);
            border-radius: 12px;
            overflow: hidden;
            box-shadow: 0 4px 6px rgba(0,0,0,0.15);
        }}

        .finding-header {{
            padding: 16px 20px;
            background-color: rgba(255,255,255,0.02);
            border-bottom: 1px solid var(--border-primary);
            display: flex;
            justify-content: space-between;
            align-items: center;
            flex-wrap: wrap;
            gap: 12px;
        }}

        .finding-header-left {{
            display: flex;
            align-items: center;
            gap: 12px;
        }}

        .finding-title {{
            font-weight: 600;
            font-size: 0.9375rem;
        }}

        .badge {{
            padding: 4px 10px;
            border-radius: 6px;
            font-size: 0.75rem;
            font-weight: 600;
            text-transform: uppercase;
        }}

        .badge-critical {{ background-color: rgba(239, 68, 68, 0.15); color: var(--accent-critical); border: 1px solid rgba(239, 68, 68, 0.25); }}
        .badge-high {{ background-color: rgba(249, 115, 22, 0.15); color: var(--accent-high); border: 1px solid rgba(249, 115, 22, 0.25); }}
        .badge-medium {{ background-color: rgba(234, 179, 8, 0.15); color: var(--accent-medium); border: 1px solid rgba(234, 179, 8, 0.25); }}
        .badge-low {{ background-color: rgba(59, 130, 246, 0.15); color: var(--accent-low); border: 1px solid rgba(59, 130, 246, 0.25); }}
        .badge-info {{ background-color: rgba(107, 114, 128, 0.15); color: var(--accent-info); border: 1px solid rgba(107, 114, 128, 0.25); }}

        .detector-tag {{
            font-size: 0.75rem;
            color: var(--text-muted);
            background-color: var(--bg-tertiary);
            padding: 2px 8px;
            border-radius: 4px;
        }}

        .finding-body {{
            padding: 20px;
        }}

        .finding-meta {{
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 12px;
            font-size: 0.8125rem;
            color: var(--text-secondary);
            margin-bottom: 16px;
            background-color: rgba(255, 255, 255, 0.01);
            padding: 12px;
            border-radius: 8px;
            border: 1px solid rgba(255, 255, 255, 0.03);
        }}

        .finding-description {{
            font-size: 0.875rem;
            color: var(--text-secondary);
            margin-bottom: 20px;
            white-space: pre-wrap;
        }}

        .code-block {{
            background-color: var(--bg-primary);
            border: 1px solid var(--border-primary);
            border-radius: 8px;
            padding: 16px;
            font-family: 'JetBrains Mono', monospace;
            font-size: 0.8125rem;
            color: #e5e7eb;
            overflow-x: auto;
            white-space: pre;
        }}

        .no-findings {{
            text-align: center;
            padding: 60px;
            background-color: var(--bg-secondary);
            border: 1px solid var(--border-primary);
            border-radius: 12px;
            color: var(--accent-low);
        }}

        .no-findings-title {{
            font-size: 1.25rem;
            font-weight: 600;
            color: #10b981;
            margin-bottom: 10px;
        }}

        footer {{
            text-align: center;
            margin-top: 50px;
            font-size: 0.75rem;
            color: var(--text-muted);
            border-top: 1px solid var(--border-primary);
            padding-top: 20px;
        }}
    </style>
</head>
<body>
    <div class="container">
        <!-- Header -->
        <header>
            <div class="header-title">
                <h1>Security Audit Report</h1>
                <p>Project: <strong>{html.escape(project.name)}</strong></p>
            </div>
            <div class="header-meta">
                <div class="header-meta-item">Generated on: <strong>{scan_date}</strong></div>
                <div class="header-meta-item">Duration: <strong>{duration}</strong></div>
                <div class="header-meta-item">Scan Type: <strong>Full Security Scan (Combined)</strong></div>
            </div>
        </header>

        <!-- Dashboard summary stats -->
        <div class="summary-dashboard">
            <div class="summary-card total-card">
                <div class="value">{total_findings}</div>
                <div class="label">Total Issues</div>
            </div>
            <div class="summary-card critical-card">
                <div class="value">{counts["critical"]}</div>
                <div class="label">Critical</div>
            </div>
            <div class="summary-card high-card">
                <div class="value">{counts["high"]}</div>
                <div class="label">High</div>
            </div>
            <div class="summary-card medium-card">
                <div class="value">{counts["medium"]}</div>
                <div class="label">Medium</div>
            </div>
            <div class="summary-card low-card">
                <div class="value">{counts["low"]}</div>
                <div class="label">Low</div>
            </div>
        </div>

        <!-- Findings List -->
        <h2 class="section-title">
            <span>🛡️</span> Detailed Findings ({total_findings})
        </h2>

        <div class="findings-list">
            """

    if not sorted_findings:
        html_content += """
            <div class="no-findings">
                <div class="no-findings-title">✓ No Vulnerabilities Found</div>
                <p>Clean scan! Your project does not contain any detected security issues, dependency vulnerabilities, or hardcoded secrets.</p>
            </div>
        """
    else:
        for idx, f in enumerate(sorted_findings):
            sev = f.severity.value if hasattr(f.severity, "value") else str(f.severity).lower()
            rule_id = f.rule_id or "N/A"
            cve_id = f.cve_id or ""
            detector = f.detector_type or "Unknown"
            
            cve_str = f" | CVE: <strong>{html.escape(cve_id)}</strong>" if cve_id else ""
            line_str = f" (Line {f.line_start})" if f.line_start else ""
            file_path = f.file_path or "N/A"
            
            html_content += f"""
            <div class="finding-item">
                <div class="finding-header">
                    <div class="finding-header-left">
                        <span class="badge badge-{sev}">{sev}</span>
                        <span class="finding-title">{html.escape(f.title)}</span>
                    </div>
                    <span class="detector-tag">{html.escape(detector)}</span>
                </div>
                <div class="finding-body">
                    <div class="finding-meta">
                        <div>File: <strong>{html.escape(file_path)}{line_str}</strong></div>
                        <div>Rule: <strong>{html.escape(rule_id)}</strong>{cve_str}</div>
                    </div>
                    <div class="finding-description">{html.escape(f.description or "No description provided.")}</div>
            """
            
            if f.code_snippet:
                html_content += f"""
                    <pre class="code-block"><code>{html.escape(f.code_snippet)}</code></pre>
                """
                
            html_content += """
                </div>
            </div>
            """

    html_content += """
        </div>

        <!-- Footer -->
        <footer>
            <p>SCA Platform — Standalone Static Code Analysis and Security Reports</p>
        </footer>
    </div>
</body>
</html>
"""
    return html_content
