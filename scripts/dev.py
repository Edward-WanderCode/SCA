"""
Makefile-style commands for SCA Platform development.
Provides consistent interface across different environments.

Usage:
    python scripts/dev.py <command>
    
Available commands:
    install         - Install dependencies
    migrate         - Run database migrations
    rollback        - Rollback last migration
    create-admin    - Create admin user
    test            - Run tests
    test-cov        - Run tests with coverage
    lint            - Run linters
    format          - Format code
    security-check  - Check for security vulnerabilities
    clean           - Clean temporary files
    docker-build    - Build Docker images
    docker-up       - Start services with Docker Compose
    docker-down     - Stop services
    dev             - Start development servers
"""

import subprocess
import sys
import argparse
from pathlib import Path

PROJECT_ROOT = Path(__file__).parent.parent
BACKEND_DIR = PROJECT_ROOT / "backend"
FRONTEND_DIR = PROJECT_ROOT / "frontend"


def run_command(cmd: list[str], cwd: Path | None = None, check: bool = True):
    """Run a shell command."""
    print(f"Running: {' '.join(cmd)}")
    result = subprocess.run(cmd, cwd=cwd, check=check)
    return result.returncode == 0


def install():
    """Install all dependencies."""
    print("📦 Installing backend dependencies...")
    run_command(["pip", "install", "-r", "requirements.txt"], cwd=BACKEND_DIR)
    
    print("\n📦 Installing frontend dependencies...")
    run_command(["npm", "install"], cwd=FRONTEND_DIR)
    
    print("\n✅ Dependencies installed!")


def migrate():
    """Run database migrations."""
    print("🗄️  Running database migrations...")
    run_command(["alembic", "upgrade", "head"], cwd=BACKEND_DIR)
    print("✅ Migrations applied!")


def rollback():
    """Rollback last migration."""
    print("⏪ Rolling back last migration...")
    run_command(["alembic", "downgrade", "-1"], cwd=BACKEND_DIR)
    print("✅ Rollback complete!")


def create_admin():
    """Create admin user."""
    print("👤 Creating admin user...")
    run_command(["python", "scripts/create_admin.py"], cwd=BACKEND_DIR)


def test():
    """Run tests."""
    print("🧪 Running tests...")
    run_command(["pytest", "-v"], cwd=BACKEND_DIR)


def test_cov():
    """Run tests with coverage."""
    print("🧪 Running tests with coverage...")
    run_command(
        ["pytest", "--cov=.", "--cov-report=html", "--cov-report=term"],
        cwd=BACKEND_DIR,
    )
    print(f"\n📊 Coverage report: {BACKEND_DIR}/htmlcov/index.html")


def lint():
    """Run linters."""
    print("🔍 Running backend linters...")
    run_command(["ruff", "check", "."], cwd=BACKEND_DIR, check=False)
    
    print("\n🔍 Running frontend linters...")
    run_command(["npm", "run", "lint"], cwd=FRONTEND_DIR, check=False)


def format_code():
    """Format code."""
    print("✨ Formatting backend code...")
    run_command(["black", "."], cwd=BACKEND_DIR)
    run_command(["isort", "."], cwd=BACKEND_DIR)
    
    print("\n✨ Formatting frontend code...")
    run_command(["npm", "run", "format"], cwd=FRONTEND_DIR, check=False)


def security_check():
    """Check for security vulnerabilities."""
    print("🔒 Checking backend dependencies...")
    run_command(["safety", "check"], cwd=BACKEND_DIR, check=False)
    
    print("\n🔒 Checking frontend dependencies...")
    run_command(["npm", "audit"], cwd=FRONTEND_DIR, check=False)


def clean():
    """Clean temporary files."""
    print("🧹 Cleaning temporary files...")
    
    patterns = [
        "**/__pycache__",
        "**/*.pyc",
        "**/.pytest_cache",
        "**/.coverage",
        "**/htmlcov",
        "**/node_modules/.cache",
    ]
    
    import shutil
    for pattern in patterns:
        for path in PROJECT_ROOT.rglob(pattern.replace("**/", "")):
            if path.is_dir():
                print(f"Removing {path}")
                shutil.rmtree(path, ignore_errors=True)
    
    print("✅ Cleanup complete!")


def docker_build():
    """Build Docker images."""
    print("🐳 Building Docker images...")
    run_command(["docker-compose", "build"], cwd=PROJECT_ROOT)


def docker_up():
    """Start services with Docker Compose."""
    print("🐳 Starting services...")
    run_command(["docker-compose", "up", "-d"], cwd=PROJECT_ROOT)
    print("\n✅ Services started!")
    print("Backend:  http://localhost:8001")
    print("Frontend: http://localhost:3000")


def docker_down():
    """Stop services."""
    print("🐳 Stopping services...")
    run_command(["docker-compose", "down"], cwd=PROJECT_ROOT)


def dev():
    """Start development servers."""
    print("🚀 Starting development servers...")
    print("\n⚠️  Run these in separate terminals:")
    print("\nBackend:")
    print(f"  cd {BACKEND_DIR}")
    print("  uvicorn main:app --reload --port 8000")
    print("\nFrontend:")
    print(f"  cd {FRONTEND_DIR}")
    print("  npm run dev")
    print("\nCelery Worker:")
    print(f"  cd {BACKEND_DIR}")
    print("  celery -A workers.celery_app worker --loglevel=info")


COMMANDS = {
    "install": install,
    "migrate": migrate,
    "rollback": rollback,
    "create-admin": create_admin,
    "test": test,
    "test-cov": test_cov,
    "lint": lint,
    "format": format_code,
    "security-check": security_check,
    "clean": clean,
    "docker-build": docker_build,
    "docker-up": docker_up,
    "docker-down": docker_down,
    "dev": dev,
}


def main():
    parser = argparse.ArgumentParser(
        description="SCA Platform development commands",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__,
    )
    parser.add_argument(
        "command",
        choices=COMMANDS.keys(),
        help="Command to run",
    )
    
    args = parser.parse_args()
    
    try:
        COMMANDS[args.command]()
    except KeyboardInterrupt:
        print("\n\n⚠️  Interrupted by user")
        sys.exit(1)
    except Exception as e:
        print(f"\n❌ Error: {e}")
        sys.exit(1)


if __name__ == "__main__":
    main()
