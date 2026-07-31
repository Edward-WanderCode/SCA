import pytest
import os
import json
from utils.scanner_utils import parse_json_stream, parse_json_output, calculate_directory_hashes

def test_parse_json_stream():
    output = '{"id": 1}\n{"id": 2}\n\n{"id": 3}'
    results = parse_json_stream(output)
    assert len(results) == 3
    assert results[0]["id"] == 1
    assert results[2]["id"] == 3

def test_parse_json_stream_invalid():
    output = '{"id": 1}\ninvalid json\n{"id": 3}'
    results = parse_json_stream(output)
    assert len(results) == 2
    assert results[1]["id"] == 3

def test_parse_json_output():
    output = '{"results": [1, 2, 3]}'
    result = parse_json_output(output)
    assert "results" in result
    assert result["results"] == [1, 2, 3]

def test_parse_json_output_invalid():
    output = 'not a json'
    result = parse_json_output(output)
    assert result == {}

def test_calculate_directory_hashes(tmp_path):
    # Create temporary directory with some files
    d = tmp_path / "sub"
    d.mkdir()
    p1 = d / "file1.txt"
    p1.write_text("hello")
    p2 = d / "file2.txt"
    p2.write_text("world")
    
    # Calculate hashes
    hashes = calculate_directory_hashes(str(tmp_path))
    
    assert "sub/file1.txt" in hashes
    assert "sub/file2.txt" in hashes
    assert len(hashes) == 2
    # Check stable hash
    assert hashes["sub/file1.txt"] == "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824"

