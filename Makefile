# nband: one entry point for everything.
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

.PHONY: help install codegen check check-fast lint lint-web lint-python format test \
        test-firmware test-discriminator \
        drift parity links privacy prose boards boards-deps boards-check boards-verify build dev deploy \
        fixtures seed clean node-selftest

help: ## List available targets
	@grep -hE '^[a-z-]+:.*?## ' $(MAKEFILE_LIST) \
	  | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[1m%-20s\033[0m %s\n", $$1, $$2}'

install: ## Install JS and Python dependencies, pinned to match CI
	yarn install
	$(PY) -m pip install --quiet -r requirements-dev.txt

codegen: ## Regenerate bindings and the search index from schema/
	node tools/codegen.mjs
	node tools/build-search-index.mjs

fixtures: ## Regenerate discriminator conformance fixtures from the Python engine
	$(PY) tools/gen-fixtures.py

boards-deps: ## Install the board toolchain (isolated from the web workspace on purpose)
	@cd hardware && npm install --silent

boards: boards-deps ## Regenerate the tier carrier boards, system schematics and node assemblies
	@node tools/gen-boards.mjs
	@node tools/build-boards.mjs
	@node tools/gen-assembly.mjs
	@node tools/render-node.mjs
	@node tools/gen-enclosure.mjs
	@node tools/gen-system-schematic.mjs

# --- verification ------------------------------------------------------------
# Each of these is a claim the repository makes about itself.

drift: ## Schema, SQL, docs, prices and power sizing agree
	@node tools/check-drift.mjs

parity: ## The browser discriminator matches the Python engine
	@node tools/check-parity.mjs

links: ## Every internal link and every document resolves
	@node tools/check-links.mjs

privacy: ## Published positions do not give away where an operator lives
	@node tools/check-privacy.mjs

prose: ## Copy and comments follow the conventions in CLAUDE.md
	@node tools/check-prose.mjs

boards-check: ## Carrier board netlists match the hardware registry
	@node tools/check-boards.mjs

# Part of `make check`. The routing pass and the header-numbering tripwire only
# ever ran when someone typed this target by hand, while the site said the
# boards were checked on every build. CI still runs the cheap half, because it
# has no board toolchain, and boards-check says so rather than passing silently.
boards-verify: boards-deps ## The above, plus a full routing and design-rule pass
	@node tools/check-boards.mjs --full

test-firmware: ## Node agent: clock, buffers, triggering, registry, concurrency
	@$(PY) firmware/tests/test_core.py
	@$(PY) firmware/tests/test_registry.py
	@$(PY) firmware/tests/test_workers.py

test-discriminator: ## Scoring engine, mostly asserting refusals
	@$(PY) discriminator/tests/test_engine.py

test: test-firmware test-discriminator ## All Python tests

# Split by toolchain, because CI runs them in different jobs: the web job has
# node and no python, the python job has neither yarn nor the web dependencies.
# A single combined target meant whichever job ran it failed on the half it was
# not provisioned for.

lint-web: ## Type-check and lint the web app
	@yarn workspace @nband/web type-check
	@yarn workspace @nband/web lint

lint-python: ## Lint and format-check the Python packages
	@command -v ruff >/dev/null 2>&1 || { \
	  echo "  ruff is not installed, so this check would silently pass here"; \
	  echo "  and fail in CI. Run: make install"; exit 1; }
	@ruff check firmware discriminator tools
	@ruff format --check firmware discriminator tools

lint: lint-web lint-python ## Lint everything (what a contributor runs)

format: ## Format Python and web sources in place
	@command -v ruff >/dev/null 2>&1 && ruff format firmware discriminator tools || true
	@yarn prettier --write . >/dev/null 2>&1 || true
	@echo "  formatted"

build: ## Production build of the site
	@yarn workspace @nband/web build

check-fast: drift parity links privacy prose boards-verify test ## Everything except the web build
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
