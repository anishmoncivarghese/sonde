.headers on
.mode tabs

-- Q1 — Handler-chain assembler.
-- Rank application callables by the breadth of handler/callback declarations
-- they reference, then by inbound source-file fan-in and outbound call fan-out.
.print Q1_HANDLER_CHAIN_ASSEMBLER
WITH handler_refs AS (
  SELECT
    e.src_symbol_id AS symbol_id,
    COUNT(DISTINCT target.id) AS handler_type_count
  FROM edge e
  JOIN symbol target ON target.id = e.dst_symbol_id
  WHERE e.kind = 'REFERENCES'
    AND (
      lower(target.short_name) LIKE '%handler%'
      OR lower(target.short_name) LIKE '%middleware%'
      OR lower(target.short_name) LIKE '%callback%'
    )
  GROUP BY e.src_symbol_id
),
inbound_calls AS (
  SELECT
    e.dst_symbol_id AS symbol_id,
    COUNT(DISTINCT caller.id) AS inbound_callers,
    COUNT(DISTINCT caller.file_id) AS inbound_source_files
  FROM edge e
  JOIN symbol caller ON caller.id = e.src_symbol_id
  JOIN file caller_file ON caller_file.id = caller.file_id
  WHERE e.kind = 'CALLS'
    AND caller.is_test = 0
    AND caller_file.path LIKE 'src/%'
    AND caller_file.path NOT LIKE 'benchmarks/%'
    AND caller_file.path NOT LIKE 'perf-measures/%'
  GROUP BY e.dst_symbol_id
),
outbound_calls AS (
  SELECT
    e.src_symbol_id AS symbol_id,
    COUNT(DISTINCT e.dst_symbol_id) AS outbound_call_targets,
    COUNT(DISTINCT target.file_id) AS outbound_target_files
  FROM edge e
  JOIN symbol target ON target.id = e.dst_symbol_id
  WHERE e.kind = 'CALLS'
  GROUP BY e.src_symbol_id
)
SELECT
  candidate.qualified_name,
  candidate_file.path,
  handler_refs.handler_type_count,
  COALESCE(inbound_calls.inbound_callers, 0) AS inbound_callers,
  COALESCE(inbound_calls.inbound_source_files, 0) AS inbound_source_files,
  COALESCE(outbound_calls.outbound_call_targets, 0) AS outbound_call_targets,
  COALESCE(outbound_calls.outbound_target_files, 0) AS outbound_target_files
FROM symbol candidate
JOIN file candidate_file ON candidate_file.id = candidate.file_id
JOIN handler_refs ON handler_refs.symbol_id = candidate.id
LEFT JOIN inbound_calls ON inbound_calls.symbol_id = candidate.id
LEFT JOIN outbound_calls ON outbound_calls.symbol_id = candidate.id
WHERE candidate.kind IN ('function', 'method', 'property', 'variable')
  AND candidate.is_test = 0
  AND candidate_file.path LIKE 'src/%'
  AND candidate_file.path NOT LIKE 'benchmarks/%'
  AND candidate_file.path NOT LIKE 'perf-measures/%'
ORDER BY
  handler_refs.handler_type_count DESC,
  inbound_source_files DESC,
  outbound_call_targets DESC,
  candidate.exported DESC,
  candidate.qualified_name ASC
LIMIT 3;

-- Q2 and Q4 — Lifecycle carrier, reused verbatim for both questions.
-- Rank exported class/interface owners by distinct external source files using
-- their members, then by used-member breadth and total member breadth.
.print Q2_Q4_LIFECYCLE_CARRIER
WITH member_usage AS (
  SELECT
    owner.id AS owner_id,
    COUNT(DISTINCT member.id) AS member_count,
    COUNT(DISTINCT CASE
      WHEN use_edge.kind IN ('CALLS', 'REFERENCES')
       AND user.is_test = 0
       AND user_file.path LIKE 'src/%'
       AND user_file.id <> owner_file.id
      THEN member.id
    END) AS externally_used_members,
    COUNT(DISTINCT CASE
      WHEN use_edge.kind IN ('CALLS', 'REFERENCES')
       AND user.is_test = 0
       AND user_file.path LIKE 'src/%'
       AND user_file.id <> owner_file.id
      THEN user_file.id
    END) AS external_user_files
  FROM symbol owner
  JOIN file owner_file ON owner_file.id = owner.file_id
  LEFT JOIN edge contains_edge
    ON contains_edge.src_symbol_id = owner.id
   AND contains_edge.kind = 'CONTAINS'
  LEFT JOIN symbol member ON member.id = contains_edge.dst_symbol_id
  LEFT JOIN edge use_edge
    ON use_edge.dst_symbol_id = member.id
   AND use_edge.kind IN ('CALLS', 'REFERENCES')
  LEFT JOIN symbol user ON user.id = use_edge.src_symbol_id
  LEFT JOIN file user_file ON user_file.id = user.file_id
  WHERE owner.kind IN ('class', 'interface')
    AND owner.exported = 1
    AND owner.is_test = 0
    AND owner_file.path LIKE 'src/%'
    AND owner_file.path NOT LIKE 'benchmarks/%'
    AND owner_file.path NOT LIKE 'perf-measures/%'
  GROUP BY owner.id
),
direct_usage AS (
  SELECT
    e.dst_symbol_id AS owner_id,
    COUNT(DISTINCT source.file_id) AS direct_reference_files
  FROM edge e
  JOIN symbol source ON source.id = e.src_symbol_id
  JOIN file source_file ON source_file.id = source.file_id
  WHERE e.kind IN ('CALLS', 'REFERENCES')
    AND source.is_test = 0
    AND source_file.path LIKE 'src/%'
  GROUP BY e.dst_symbol_id
)
SELECT
  owner.qualified_name,
  owner_file.path,
  member_usage.external_user_files,
  member_usage.externally_used_members,
  member_usage.member_count,
  COALESCE(direct_usage.direct_reference_files, 0) AS direct_reference_files
FROM member_usage
JOIN symbol owner ON owner.id = member_usage.owner_id
JOIN file owner_file ON owner_file.id = owner.file_id
LEFT JOIN direct_usage ON direct_usage.owner_id = owner.id
ORDER BY
  member_usage.external_user_files DESC,
  member_usage.externally_used_members DESC,
  member_usage.member_count DESC,
  direct_reference_files DESC,
  owner.qualified_name ASC
LIMIT 3;

-- Q3 — Exception boundary.
-- Rank application callables by distinct error/exception declarations touched,
-- then by inbound call fan-in and outbound coordination.
.print Q3_EXCEPTION_BOUNDARY
WITH error_contacts AS (
  SELECT
    e.src_symbol_id AS symbol_id,
    COUNT(DISTINCT target.id) AS error_target_count
  FROM edge e
  JOIN symbol target ON target.id = e.dst_symbol_id
  WHERE e.kind IN ('CALLS', 'REFERENCES')
    AND (
      lower(target.short_name) LIKE '%error%'
      OR lower(target.short_name) LIKE '%exception%'
    )
  GROUP BY e.src_symbol_id
),
inbound_calls AS (
  SELECT
    e.dst_symbol_id AS symbol_id,
    COUNT(DISTINCT caller.id) AS inbound_callers,
    COUNT(DISTINCT caller.file_id) AS inbound_source_files
  FROM edge e
  JOIN symbol caller ON caller.id = e.src_symbol_id
  JOIN file caller_file ON caller_file.id = caller.file_id
  WHERE e.kind = 'CALLS'
    AND caller.is_test = 0
    AND caller_file.path LIKE 'src/%'
  GROUP BY e.dst_symbol_id
),
outbound_calls AS (
  SELECT
    e.src_symbol_id AS symbol_id,
    COUNT(DISTINCT e.dst_symbol_id) AS outbound_call_targets
  FROM edge e
  WHERE e.kind = 'CALLS'
  GROUP BY e.src_symbol_id
)
SELECT
  candidate.qualified_name,
  candidate_file.path,
  error_contacts.error_target_count,
  COALESCE(inbound_calls.inbound_callers, 0) AS inbound_callers,
  COALESCE(inbound_calls.inbound_source_files, 0) AS inbound_source_files,
  COALESCE(outbound_calls.outbound_call_targets, 0) AS outbound_call_targets
FROM symbol candidate
JOIN file candidate_file ON candidate_file.id = candidate.file_id
JOIN error_contacts ON error_contacts.symbol_id = candidate.id
LEFT JOIN inbound_calls ON inbound_calls.symbol_id = candidate.id
LEFT JOIN outbound_calls ON outbound_calls.symbol_id = candidate.id
WHERE candidate.kind IN ('function', 'method', 'property', 'variable')
  AND candidate.is_test = 0
  AND candidate_file.path LIKE 'src/%'
  AND candidate_file.path NOT LIKE 'benchmarks/%'
  AND candidate_file.path NOT LIKE 'perf-measures/%'
ORDER BY
  error_contacts.error_target_count DESC,
  inbound_source_files DESC,
  inbound_callers DESC,
  outbound_call_targets DESC,
  candidate.qualified_name ASC
LIMIT 3;

-- Q5 — Fallback terminal.
-- Rank handler-typed callables that reach a response declaration within two
-- graph steps and are themselves referenced as values or called by source code.
.print Q5_FALLBACK_TERMINAL
WITH response_reach(symbol_id, response_id, depth) AS (
  SELECT e.src_symbol_id, target.id, 1
  FROM edge e
  JOIN symbol target ON target.id = e.dst_symbol_id
  WHERE e.kind IN ('CALLS', 'REFERENCES')
    AND lower(target.short_name) LIKE '%response%'
  UNION ALL
  SELECT first.src_symbol_id, target.id, 2
  FROM edge first
  JOIN edge second ON second.src_symbol_id = first.dst_symbol_id
  JOIN symbol target ON target.id = second.dst_symbol_id
  WHERE first.kind IN ('CALLS', 'REFERENCES')
    AND second.kind IN ('CALLS', 'REFERENCES')
    AND lower(target.short_name) LIKE '%response%'
),
response_contacts AS (
  SELECT
    symbol_id,
    COUNT(DISTINCT response_id) AS response_target_count,
    MIN(depth) AS response_depth
  FROM response_reach
  GROUP BY symbol_id
),
handler_contacts AS (
  SELECT
    e.src_symbol_id AS symbol_id,
    COUNT(DISTINCT target.id) AS handler_target_count
  FROM edge e
  JOIN symbol target ON target.id = e.dst_symbol_id
  WHERE e.kind = 'REFERENCES'
    AND (
      lower(target.short_name) LIKE '%handler%'
      OR lower(target.short_name) LIKE '%middleware%'
      OR lower(target.short_name) LIKE '%callback%'
    )
  GROUP BY e.src_symbol_id
),
inbound_usage AS (
  SELECT
    e.dst_symbol_id AS symbol_id,
    COUNT(DISTINCT CASE WHEN e.kind = 'REFERENCES' THEN source.id END)
      AS inbound_references,
    COUNT(DISTINCT CASE WHEN e.kind = 'REFERENCES' THEN source.file_id END)
      AS inbound_reference_files,
    COUNT(DISTINCT CASE WHEN e.kind = 'CALLS' THEN source.id END)
      AS inbound_callers,
    COUNT(DISTINCT CASE WHEN e.kind = 'CALLS' THEN source.file_id END)
      AS inbound_call_files
  FROM edge e
  JOIN symbol source ON source.id = e.src_symbol_id
  JOIN file source_file ON source_file.id = source.file_id
  WHERE e.kind IN ('CALLS', 'REFERENCES')
    AND source.is_test = 0
    AND source_file.path LIKE 'src/%'
  GROUP BY e.dst_symbol_id
)
SELECT
  candidate.qualified_name,
  candidate_file.path,
  response_contacts.response_depth,
  response_contacts.response_target_count,
  handler_contacts.handler_target_count,
  COALESCE(inbound_usage.inbound_references, 0) AS inbound_references,
  COALESCE(inbound_usage.inbound_reference_files, 0) AS inbound_reference_files,
  COALESCE(inbound_usage.inbound_callers, 0) AS inbound_callers,
  COALESCE(inbound_usage.inbound_call_files, 0) AS inbound_call_files
FROM symbol candidate
JOIN file candidate_file ON candidate_file.id = candidate.file_id
JOIN response_contacts ON response_contacts.symbol_id = candidate.id
JOIN handler_contacts ON handler_contacts.symbol_id = candidate.id
LEFT JOIN inbound_usage ON inbound_usage.symbol_id = candidate.id
WHERE candidate.kind IN ('function', 'method', 'property', 'variable')
  AND candidate.is_test = 0
  AND candidate_file.path LIKE 'src/%'
  AND candidate_file.path NOT LIKE 'benchmarks/%'
  AND candidate_file.path NOT LIKE 'perf-measures/%'
ORDER BY
  response_contacts.response_depth ASC,
  handler_contacts.handler_target_count DESC,
  inbound_reference_files DESC,
  inbound_call_files DESC,
  response_contacts.response_target_count DESC,
  candidate.qualified_name ASC
LIMIT 3;
