# POSEIDON MODE FIX PLAN — v4.4.1

## Problem
Poseidon Mode is invisible to the user, model doesn't drive autonomously, max cycles breaks execution, audit times out on large projects.

## Root Cause
System prompt has no Poseidon-specific behavioral mandate. Tool output says "Next Step" but doesn't mandate autonomous execution. Max cycles aborts instead of self-healing via PSM.

## Fixes
1. Poseidon behavioral mandate in system.transform (static string when active, cache-safe)
2. Kill max cycles — stall triggers PSM self-heal, never aborts to user
3. Strengthen tool output directives ("MANDATORY", "Do NOT wait", "Execute NOW")
4. Audit timeout 120s→600s
5. Rebuild + deploy

## Cache Impact
2 breaks per Poseidon session (activate adds mandate, deactivate removes it). Zero during operation.
