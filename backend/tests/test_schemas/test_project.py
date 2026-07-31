import pytest
from pydantic import ValidationError
from schemas.project import ProjectCreate, ProjectUpdate

def test_project_create_valid():
    data = {
        "name": "Test Project",
        "repo_url": "https://github.com/example/repo"
    }
    project = ProjectCreate(**data)
    assert project.name == "Test Project"
    assert project.repo_url == "https://github.com/example/repo"
    assert project.branch == "main"
    assert project.description is None
    assert project.language is None

def test_project_create_invalid_name():
    data = {
        "name": "",
        "repo_url": "https://github.com/example/repo"
    }
    with pytest.raises(ValidationError) as exc:
        ProjectCreate(**data)
    assert "String should have at least 1 character" in str(exc.value)

def test_project_create_missing_repo():
    data = {
        "name": "Test Project"
    }
    with pytest.raises(ValidationError):
        ProjectCreate(**data)

def test_project_update_valid():
    data = {
        "name": "Updated Name",
        "branch": "develop"
    }
    project = ProjectUpdate(**data)
    assert project.name == "Updated Name"
    assert project.branch == "develop"
    assert project.repo_url is None

def test_project_update_invalid():
    data = {
        "name": ""
    }
    with pytest.raises(ValidationError):
        ProjectUpdate(**data)
