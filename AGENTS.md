<!-- whyline:begin -->
## Recording decisions

After completing any non-trivial change, record the reasoning:

    whyline note "<one-line decision>" \
      --because "<why this choice>" \
      --rejected "<option>: <why not>" \
      --file <path>

Record only genuine choices a future reader would wonder about. Skip typos,
formatting and renames. `--rejected` is repeatable. Do not ask permission.
Store shared project instructions here, but record evolving decision history
through whyline rather than appending it to AGENTS.md.
<!-- whyline:end -->


<!-- whyline:m0-probe-begin -->
## Recording decisions (M0 probe)

After completing any non-trivial change, record it:

    WHYLINE_PROBE_AGENT="claude-or-codex" whyline-probe "<one-line decision>" "<option you rejected>: <why not>"

Replace `claude-or-codex` with the agent currently doing the work. Record only
genuine choices a future reader would wonder about. Skip typos, formatting and
renames. Do not ask permission.
<!-- whyline:m0-probe-end -->
