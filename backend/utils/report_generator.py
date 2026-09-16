import html
from datetime import datetime
from utils.path_utils import normalize_relative_path


def generate_html_report(project, scan, findings) -> str:
    """
    Generate a beautiful, standalone HTML report for a security scan.
    Highlights relative file paths for all findings and includes an Affected Files summary.
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
    scan_type_name = (
        scan.scan_type.value.upper()
        if hasattr(scan, "scan_type") and hasattr(scan.scan_type, "value")
        else str(getattr(scan, "scan_type", "COMBINED")).upper()
    )

    # Sort findings: Critical -> High -> Medium -> Low -> Info
    severity_order = {"critical": 0, "high": 1, "medium": 2, "low": 3, "info": 4}
    sorted_findings = sorted(
        findings,
        key=lambda x: severity_order.get(
            x.severity.value if hasattr(x.severity, "value") else str(x.severity).lower(), 5
        )
    )

    # Group findings by normalized relative file path
    files_summary: dict[str, dict] = {}
    for idx, f in enumerate(sorted_findings, 1):
        rel_path = normalize_relative_path(f.file_path)
        display_path = rel_path if rel_path else "(Cấu hình dự án / Không gắn với tệp cụ thể)"
        if display_path not in files_summary:
            files_summary[display_path] = {
                "critical": 0, "high": 0, "medium": 0, "low": 0, "info": 0,
                "total": 0,
                "rel_path": rel_path,
                "first_finding_id": f"finding-{idx}",
            }
        sev = f.severity.value if hasattr(f.severity, "value") else str(f.severity).lower()
        if sev in files_summary[display_path]:
            files_summary[display_path][sev] += 1
        files_summary[display_path]["total"] += 1

    # Build Affected Files Table HTML
    affected_files_html = ""
    if files_summary:
        rows_html = ""
        for row_idx, (path_key, info) in enumerate(files_summary.items(), 1):
            sev_badges = ""
            for s in ("critical", "high", "medium", "low", "info"):
                if info[s] > 0:
                    sev_badges += f'<span class="badge badge-{s}" style="margin-right: 4px; font-size: 0.7rem; padding: 2px 6px;">{s.upper()}: {info[s]}</span>'

            jump_btn = f'<a href="#{info["first_finding_id"]}" class="jump-btn">Xem chi tiết &darr;</a>'

            rows_html += f"""
            <tr>
                <td style="color: var(--text-muted); font-size: 0.8rem; text-align: center;">{row_idx}</td>
                <td>
                    <code class="file-link-code">📄 {html.escape(path_key)}</code>
                </td>
                <td style="text-align: center;">
                    <span class="file-count-badge">{info["total"]}</span>
                </td>
                <td>{sev_badges}</td>
                <td style="text-align: right;">{jump_btn}</td>
            </tr>
            """

        affected_files_html = f"""
        <!-- Affected Files Summary Table -->
        <div class="affected-files-section">
            <h2 class="section-title" style="margin-bottom: 6px;">
                <span>📁</span> Danh sách tệp tin chứa lỗ hổng ({len(files_summary)})
            </h2>
            <p class="section-subtitle">Chỉ rõ đường dẫn tương đối (Relative Path) của từng tệp trong dự án phát hiện vấn đề an ninh</p>
            <div style="overflow-x: auto;">
                <table class="affected-files-table">
                    <thead>
                        <tr>
                            <th style="width: 40px; text-align: center;">#</th>
                            <th>Đường dẫn tương đối (Relative Path)</th>
                            <th style="width: 110px; text-align: center;">Số lượng lỗi</th>
                            <th>Mức độ nghiêm trọng</th>
                            <th style="width: 130px; text-align: right;">Thao tác</th>
                        </tr>
                    </thead>
                    <tbody>
                        {rows_html}
                    </tbody>
                </table>
            </div>
        </div>
        """

    # HTML template with embedded styling
    html_content = f"""<!DOCTYPE html>
<html lang="vi">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>SCA Security Report - {html.escape(project.name)}</title>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500;600&display=swap" rel="stylesheet">
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

        html {{
            scroll-behavior: smooth;
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
            margin-bottom: 36px;
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

        /* Section titles */
        h2.section-title {{
            font-size: 1.25rem;
            font-weight: 600;
            margin-bottom: 20px;
            display: flex;
            align-items: center;
            gap: 8px;
        }}

        .section-subtitle {{
            font-size: 0.8125rem;
            color: var(--text-muted);
            margin-top: -12px;
            margin-bottom: 16px;
        }}

        /* Affected Files Section */
        .affected-files-section {{
            background-color: var(--bg-secondary);
            border: 1px solid var(--border-primary);
            border-radius: 12px;
            padding: 24px;
            margin-bottom: 36px;
            box-shadow: 0 4px 6px rgba(0, 0, 0, 0.15);
        }}

        .affected-files-table {{
            width: 100%;
            border-collapse: collapse;
            font-size: 0.875rem;
        }}

        .affected-files-table th {{
            text-align: left;
            padding: 10px 14px;
            background-color: var(--bg-tertiary);
            color: var(--text-secondary);
            font-weight: 600;
            border-bottom: 1px solid var(--border-primary);
            font-size: 0.75rem;
            text-transform: uppercase;
            letter-spacing: 0.05em;
        }}

        .affected-files-table td {{
            padding: 12px 14px;
            border-bottom: 1px solid rgba(255, 255, 255, 0.04);
            color: var(--text-primary);
        }}

        .affected-files-table tr:hover td {{
            background-color: rgba(255, 255, 255, 0.02);
        }}

        .file-link-code {{
            font-family: 'JetBrains Mono', monospace;
            font-size: 0.8125rem;
            font-weight: 600;
            color: #93c5fd;
            background: rgba(59, 130, 246, 0.1);
            padding: 4px 10px;
            border-radius: 6px;
            border: 1px solid rgba(59, 130, 246, 0.25);
            display: inline-flex;
            align-items: center;
            gap: 6px;
            word-break: break-all;
        }}

        .file-count-badge {{
            display: inline-block;
            background-color: rgba(99, 102, 241, 0.2);
            color: #a5b4fc;
            border: 1px solid rgba(99, 102, 241, 0.35);
            padding: 2px 10px;
            border-radius: 12px;
            font-weight: 700;
            font-size: 0.75rem;
        }}

        .jump-btn {{
            display: inline-block;
            color: #818cf8;
            font-size: 0.75rem;
            text-decoration: none;
            font-weight: 600;
            padding: 4px 10px;
            border-radius: 6px;
            background: rgba(99, 102, 241, 0.1);
            border: 1px solid rgba(99, 102, 241, 0.2);
            transition: all 150ms ease;
        }}

        .jump-btn:hover {{
            background: rgba(99, 102, 241, 0.25);
            color: #c7d2fe;
        }}

        /* Findings Section */
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
            scroll-margin-top: 24px;
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

        /* Prominent File Location Box */
        .file-location-box {{
            display: flex;
            align-items: center;
            flex-wrap: wrap;
            gap: 10px;
            background-color: rgba(99, 102, 241, 0.08);
            border: 1px solid rgba(99, 102, 241, 0.25);
            border-radius: 8px;
            padding: 10px 14px;
            margin-bottom: 16px;
            font-size: 0.875rem;
        }}

        .file-location-label {{
            font-weight: 600;
            color: #a5b4fc;
            display: flex;
            align-items: center;
            gap: 6px;
        }}

        .file-location-code {{
            font-family: 'JetBrains Mono', monospace;
            font-weight: 600;
            color: #67e8f9;
            background: rgba(0, 0, 0, 0.35);
            padding: 4px 10px;
            border-radius: 6px;
            border: 1px solid rgba(103, 232, 249, 0.2);
            word-break: break-all;
        }}

        .line-badge {{
            color: #fde047;
            font-weight: 600;
            font-size: 0.75rem;
            background: rgba(234, 179, 8, 0.15);
            border: 1px solid rgba(234, 179, 8, 0.3);
            padding: 3px 8px;
            border-radius: 6px;
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
                <p>Dự án: <strong>{html.escape(project.name)}</strong></p>
            </div>
            <div class="header-meta">
                <div class="header-meta-item">Thời gian xuất: <strong>{scan_date}</strong></div>
                <div class="header-meta-item">Thời lượng: <strong>{duration}</strong></div>
                <div class="header-meta-item">Loại quét: <strong>{scan_type_name}</strong></div>
            </div>
        </header>

        <!-- Dashboard summary stats -->
        <div class="summary-dashboard">
            <div class="summary-card total-card">
                <div class="value">{total_findings}</div>
                <div class="label">Tổng số lỗi</div>
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

        {affected_files_html}

        <!-- Findings List -->
        <h2 class="section-title">
            <span>🛡️</span> Chi tiết các lỗ hổng ({total_findings})
        </h2>

        <div class="findings-list">
            """

    if not sorted_findings:
        html_content += """
            <div class="no-findings">
                <div class="no-findings-title">✓ Không phát hiện lỗ hổng an ninh nào</div>
                <p>Mã nguồn sạch! Không tìm thấy lỗ hổng SAST, dependencies (SCA) hay hardcoded secrets nào trong đợt quét này.</p>
            </div>
        """
    else:
        for idx, f in enumerate(sorted_findings, 1):
            sev = f.severity.value if hasattr(f.severity, "value") else str(f.severity).lower()
            rule_id = f.rule_id or "N/A"
            cve_id = f.cve_id or ""
            detector = f.detector_type or "Unknown"

            cve_str = f" | CVE: <strong>{html.escape(cve_id)}</strong>" if cve_id else ""

            # Line string badge
            if f.line_start:
                if f.line_end and f.line_end != f.line_start:
                    line_badge = f'<span class="line-badge">Dòng {f.line_start} - {f.line_end}</span>'
                else:
                    line_badge = f'<span class="line-badge">Dòng {f.line_start}</span>'
            else:
                line_badge = ""

            # Normalized relative file path
            rel_file_path = normalize_relative_path(f.file_path)
            display_file_path = rel_file_path if rel_file_path else "(Cấu hình dự án / Không gắn với tệp cụ thể)"

            package_item = ""
            if f.package_name:
                package_ver = f"@{f.package_version}" if f.package_version else ""
                package_item = f"<div>Package: <strong>{html.escape(f.package_name)}{html.escape(package_ver)}</strong></div>"

            html_content += f"""
            <div class="finding-item" id="finding-{idx}">
                <div class="finding-header">
                    <div class="finding-header-left">
                        <span class="badge badge-{sev}">{sev}</span>
                        <span class="finding-title">#{idx}. {html.escape(f.title)}</span>
                    </div>
                    <span class="detector-tag">{html.escape(detector)}</span>
                </div>
                <div class="finding-body">
                    <!-- Prominent Relative File Path -->
                    <div class="file-location-box">
                        <span class="file-location-label">📍 Vị trí tệp (Relative Path):</span>
                        <code class="file-location-code">{html.escape(display_file_path)}</code>
                        {line_badge}
                    </div>

                    <div class="finding-meta">
                        <div>Quy tắc (Rule): <strong>{html.escape(rule_id)}</strong>{cve_str}</div>
                        {package_item}
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
            <p>SCA Platform — Static Code Analysis and Security Reports</p>
        </footer>
    </div>
</body>
</html>
"""
    return html_content
