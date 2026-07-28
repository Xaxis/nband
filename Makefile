# nband — one entry point for everything.
#
# The repository holds a Next.js app, a Python node agent, a Python analysis
# engine, a Postgres schema, and flat-file documentation, and the whole premise
# is that they cannot drift apart. That is only true if verifying them is one
# command rather than eight remembered ones.
#
#   make          list targets
#   make check    everything CI runs
#   make dev      the site, against the mock feed

SHELL := /bin/bash
.DEFAULT_GOAL := help
PY ?= python3

.PHONY: help install codegen check check-fast lint format test test-firmware test-discriminator \
        drift parity links build dev deploy fixtures seed clean node-selftest

help: ## List available targets
	@grep -hE '^[a-z-]+:.*?## ' $(MAKEFILE_LIST) \
	  | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[1m%-20s\033[0m %s\n", $$1, $$2}'

install: ## Install JS and Python dependencies
	yarn install
	$(PY) -m pip install --quiet cryptography

codegen: ## Regenerate bindings and the search index from schema/
	node tools/codegen.mjs
	node tools/build-search-index.mjs

fixtures: ## Regenerate discriminator conformance fixtures from the Python engine
	$(PY) tools/gen-fixtures.py

# --- verification ------------------------------------------------------------
# Each of these is a claim the repository makes about itself.

drift: ## Schema, SQL, docs, prices and power sizing agree
	@node tools/check-drift.mjs

parity: ## The browser discriminator matches the Python engine
	@node tools/check-parity.mjs

links: ## Every internal link and every document resolves
	@node tools/check-links.mjs

test-firmware: ## Node agent: clock, buffers, triggering, driver registry
	@$(PY) firmware/tests/test_core.py
	@$(PY) firmware/tests/test_registry.py

test-discriminator: ## Scoring engine, mostly asserting refusals
	@$(PY) discriminator/tests/test_engine.py

test: test-firmware test-discriminator ## All Python tests

lint: ## Type-check and lint everything
	@yarn workspace @nband/web type-check
	@yarn workspace @nband/web lint
	@command -v ruff >/dev/null 2>&1 && ruff check firmware discriminator tools || \
	  echo "  ruff not installed, skipping Python lint (pip install ruff)"

format: ## Format Python and web sources in place
	@command -v ruff >/dev/null 2>&1 && ruff format firmware discriminator tools || true
	@yarn prettier --write . >/dev/null 2>&1 || true
	@echo "  formatted"

build: ## Production build of the site
	@yarn workspace @nband/web build

check-fast: drift parity links test ## Everything except the web build
	@echo "fast checks green"

check: check-fast lint build ## Everything CI runs
	@echo ""
	@echo "  all checks green"

# --- running -----------------------------------------------------------------

dev: ## Run the site locally against the mock feed
	yarn dev

node-selftest: ## Open every configured channel in simulation and print a reading
	@cd firmware && $(PY) -m nband_node.agent --config config.example.toml --simulate --self-test

seed: ## Push the hardware registry into the grid database
	@node tools/seed.mjs

deploy: check ## Verify, then deploy to production
	npx vercel@latest deploy --prod --yes

clean: ## Remove build output and caches
	rm -rf apps/web/.next
	find . -name __pycache__ -type d -prune -exec rm -rf {} + 2>/dev/null || true
	find . -name '*.pyc' -delete 2>/dev/null || true
