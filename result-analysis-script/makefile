RUN           = uv run python
MARIMO        = uv run marimo
NB_DIR        = ./notebooks
ARTEFACT_DIR  = ./artefact

NOTEBOOKS    = overview_adhoc

UTIL_SRC = \
	loaddata.py \
	plots.py \
	tables.py

.PHONY: all sync notebook clean $(NOTEBOOKS)

all: sync $(NOTEBOOKS)

sync:
	uv sync

$(NOTEBOOKS): %: $(NB_DIR)/%.py $(UTIL_SRC)
	$(RUN) $(NB_DIR)/$@.py

notebook:
	@if [ -n "$(nb)" ]; then $(MARIMO) edit $(NB_DIR)/$(nb).py; else $(MARIMO) edit; fi

clean:
	rm -rf $(ARTEFACT_DIR)
