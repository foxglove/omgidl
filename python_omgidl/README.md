# Python OMG IDL Development

This directory contains the Python implementation of the OMG IDL tools.

## Setup

Use a virtual environment with Python 3.10 or newer, then install the project in editable mode with its development dependencies:

```bash
python -m venv .venv
source .venv/bin/activate
pip install -e .[dev]
```

## Pre-commit hooks

This project uses [pre-commit](https://pre-commit.com/) to run code quality checks:

```bash
pre-commit install
pre-commit run --files $(git ls-files '*.py')
```

The hooks run `black`, `isort`, and `flake8` to ensure consistent formatting and linting.

## Testing

Run the unit tests with `pytest`:

```bash
pytest
```

