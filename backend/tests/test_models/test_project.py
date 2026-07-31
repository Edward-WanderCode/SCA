import pytest
from datetime import datetime
from models.project import Project

def test_project_model_instantiation():
    project = Project(
        name="Test Project",
        repo_url="https://github.com/example/repo",
        branch="main",
        description="A test project"
    )
    
    assert project.name == "Test Project"
    assert project.repo_url == "https://github.com/example/repo"
    assert project.branch == "main"
    assert project.description == "A test project"
    
    # ID should be generated upon commit or instantiation (default uuid)
    assert project.id is None or isinstance(project.id, str)
