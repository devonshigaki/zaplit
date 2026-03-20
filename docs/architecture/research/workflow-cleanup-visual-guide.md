# Workflow Cleanup Visual Guide

## Current State: Before Cleanup

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                                                                                 │
│   ┌──────────────────┐                                                         │
│   │  Consultation    │◄─── DISCONNECTED / OLD                                 │
│   │    Webhook       │     (DELETE THIS)                                       │
│   └────────┬─────────┘                                                         │
│            │                                                                    │
│            ▼                                                                    │
│   ┌──────────────────┐     ┌──────────────────┐                                │
│   │   HTTP Request   │     │  HTTP Request1   │◄─── DISCONNECTED / OLD        │
│   │  (Old Person)    │     │ (Old Company)    │     (DELETE THESE)            │
│   └──────────────────┘     └──────────────────┘                                │
│                                                                                 │
│   ┌──────────────────┐                                                         │
│   │ Success Response │◄─── DISCONNECTED / OLD                                 │
│   │     (old)        │     (DELETE THIS)                                       │
│   └──────────────────┘                                                         │
│                                                                                 │
│                                                                                 │
│   ╔═══════════════════════════════════════════════════════════════════════╗    │
│   ║                                                                       ║    │
│   ║  ┌──────────────────┐                                                ║    │
│   ║  │ Consultation     │◄─── ACTIVE / NEW                               ║    │
│   ║  │ Webhook1         │     (KEEP THIS)                                 ║    │
│   ║  └────────┬─────────┘                                                ║    │
│   ║           │                                                          ║    │
│   ║           ▼                                                          ║    │
│   ║  ┌──────────────────┐                                                ║    │
│   ║  │ Validate and     │◄─── KEEP                                       ║    │
│   ║  │ Process          │                                                ║    │
│   ║  └────────┬─────────┘                                                ║    │
│   ║           │                                                          ║    │
│   ║           ▼                                                          ║    │
│   ║  ┌──────────────────┐                                                ║    │
│   ║  │ Validation Check │◄─── KEEP                                       ║    │
│   ║  │ (IF node)        │                                                ║    │
│   ║  └────────┬─────────┘                                                ║    │
│   ║           │                                                          ║    │
│   ║    ┌──────┴──────┐                                                   ║    │
│   ║    │             │                                                   ║    │
│   ║    ▼             ▼                                                   ║    │
│   ║ ┌──────┐    ┌─────────┐                                              ║    │
│   ║ │Create│    │ Create  │                                              ║    │
│   ║ │Person│    │ Company │◄─── KEEP BOTH                               ║    │
│   ║ └──┬───┘    └────┬────┘                                              ║    │
│   ║    │             │                                                   ║    │
│   ║    └──────┬──────┘                                                   ║    │
│   ║           ▼                                                          ║    │
│   ║  ┌──────────────────┐                                                ║    │
│   ║  │  Merge Results   │◄─── KEEP                                       ║    │
│   ║  └────────┬─────────┘                                                ║    │
│   ║           │                                                          ║    │
│   ║           ▼                                                          ║    │
│   ║  ┌──────────────────┐                                                ║    │
│   ║  │   Extract IDs    │◄─── KEEP                                       ║    │
│   ║  └────────┬─────────┘                                                ║    │
│   ║           │                                                          ║    │
│   ║           ▼                                                          ║    │
│   ║  ┌──────────────────┐                                                ║    │
│   ║  │ Link Person to   │◄─── KEEP                                       ║    │
│   ║  │    Company       │                                                ║    │
│   ║  └────────┬─────────┘                                                ║    │
│   ║           │                                                          ║    │
│   ║           ▼                                                          ║    │
│   ║  ┌──────────────────┐                                                ║    │
│   ║  │   Create Note    │◄─── KEEP                                       ║    │
│   ║  └────────┬─────────┘                                                ║    │
│   ║           │                                                          ║    │
│   ║           ▼                                                          ║    │
│   ║  ┌──────────────────┐                                                ║    │
│   ║  │ Success Response │◄─── KEEP                                       ║    │
│   ║  │      1           │                                                ║    │
│   ║  └──────────────────┘                                                ║    │
│   ║           ▲                                                          ║    │
│   ║           │                                                            ║    │
│   ║  ┌──────────────────┐                                                ║    │
│   ║  │ Validation Error │◄─── KEEP (False branch)                        ║    │
│   ║  └──────────────────┘                                                ║    │
│   ║                                                                       ║    │
│   ╚═══════════════════════════════════════════════════════════════════════╝    │
│                        ║                                                        │
│                        ║  ═══ ACTIVE WORKFLOW (KEEP ALL)                       │
│                        ╚═══════════════════════════════════════                │
│                                                                                 │
└─────────────────────────────────────────────────────────────────────────────────┘
```

---

## Target State: After Cleanup

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                                                                                 │
│   ┌──────────────────┐                                                         │
│   │ Consultation     │                                                         │
│   │ Webhook1         │◄─── ACTIVE ENTRY POINT                                  │
│   └────────┬─────────┘                                                         │
│            │                                                                    │
│            ▼                                                                    │
│   ┌──────────────────┐                                                         │
│   │ Validate and     │                                                         │
│   │ Process          │◄─── VALIDATION + PARSING                                │
│   └────────┬─────────┘                                                         │
│            │                                                                    │
│            ▼                                                                    │
│   ┌──────────────────┐                                                         │
│   │ Validation Check │◄─── BRANCH: Valid / Invalid                             │
│   │ (IF node)        │                                                         │
│   └────────┬─────────┘                                                         │
│            │                                                                    │
│     ┌──────┴──────┐                                                             │
│     │             │                                                             │
│     ▼             ▼                                                             │
│  ┌──────┐    ┌─────────┐                                                        │
│  │Create│    │ Create  │◄─── PARALLEL EXECUTION                                 │
│  │Person│    │ Company │                                                        │
│  └──┬───┘    └────┬────┘                                                        │
│     │             │                                                             │
│     └──────┬──────┘                                                             │
│            ▼                                                                    │
│   ┌──────────────────┐                                                         │
│   │  Merge Results   │◄─── COMBINE PARALLEL RESULTS                             │
│   └────────┬─────────┘                                                         │
│            │                                                                    │
│            ▼                                                                    │
│   ┌──────────────────┐                                                         │
│   │   Extract IDs    │◄─── PARSE CRM RESPONSES                                  │
│   └────────┬─────────┘                                                         │
│            │                                                                    │
│            ▼                                                                    │
│   ┌──────────────────┐                                                         │
│   │ Link Person to   │◄─── CREATE RELATIONSHIP                                  │
│   │    Company       │                                                         │
│   └────────┬─────────┘                                                         │
│            │                                                                    │
│            ▼                                                                    │
│   ┌──────────────────┐                                                         │
│   │   Create Note    │◄─── CREATE LINKED NOTE                                   │
│   └────────┬─────────┘                                                         │
│            │                                                                    │
│            ▼                                                                    │
│   ┌──────────────────┐                                                         │
│   │ Success Response │◄─── RETURN SUCCESS                                       │
│   │      1           │                                                         │
│   └──────────────────┘                                                         │
│            ▲                                                                    │
│            │                                                                     │
│   ┌──────────────────┐                                                         │
│   │ Validation Error │◄─── RETURN ERROR (if validation fails)                  │
│   └──────────────────┘                                                         │
│                                                                                 │
└─────────────────────────────────────────────────────────────────────────────────┘
```

---

## Node Position Reference

### Before Cleanup (What You'll See)

```
        Column 1          Column 2          Column 3          Column 4
          │                 │                 │                 │
          ▼                 ▼                 ▼                 ▼
        ┌────┐            ┌────┐            ┌────┐            ┌────┐
Row 1   │OLD │            │    │            │    │            │OLD │  ◄── DELETE
        │WH  │            │    │            │    │            │Resp│     Success Response
        └──┬─┘            │    │            │    │            └────┘     (old)
           │              │    │            │    │
        ┌──┴──┐           │    │            │    │
Row 2   │OLD  │           │    │            │    │
        │HTTP │           │    │            │    │                      ◄── DELETE
        │Req  │           │    │            │    │                          HTTP Request
        └──┬──┘           │    │            │    │                          (old Person)
           │              │    │            │    │
        ┌──┴──┐           │    │            │    │
Row 3   │OLD  │           │    │            │    │
        │HTTP1│           │    │            │    │                      ◄── DELETE
        └─────┘           │    │            │    │                          HTTP Request1
                          │    │            │    │                          (old Company)
══════════════════════════════════════════════════════════════════════════════
                          │    │            │    │
                          ▼    │            │    │
                        ┌────┐ │            │    │
Row 4                   │WH1 │ │            │    │                    ◄── KEEP
                        │    │ │            │    │                        Consultation Webhook1
                        └──┬─┘ │            │    │
                           │   │            │    │
                           ▼   │            │    │
                        ┌────┐ │            │    │
Row 5                   │Val │ │            │    │                    ◄── KEEP
                        │&Pro│ │            │    │                        Validate and Process
                        └──┬─┘ │            │    │
                           │   │            │    │
                           ▼   │            │    │
                        ┌────┐ │            │    │
Row 6                   │Val │ │            │    │                    ◄── KEEP
                        │Chk │ │            │    │                        Validation Check
                        └──┬─┘ │            │    │
                           │   │            │    │
                  ┌────────┘   └────────┐   │    │
                  │                     │   │    │
                  ▼                     ▼   │    │
               ┌────┐                ┌────┐ │    │
Row 7          │Cre │                │Cre │ │    │                  ◄── KEEP BOTH
               │Per │                │Com │ │    │                      Create Person
               └──┬─┘                └──┬─┘ │    │                      Create Company
                  │                     │   │    │
                  └──────────┬──────────┘   │    │
                             ▼              │    │
                          ┌────┐            │    │
Row 8                     │Merg│            │    │                  ◄── KEEP
                          │Res │            │    │                      Merge Results
                          └──┬─┘            │    │
                             │              │    │
                             ▼              │    │
                          ┌────┐            │    │
Row 9                     │Ext │            │    │                  ◄── KEEP
                          │ID │             │    │                      Extract IDs
                          └──┬─┘            │    │
                             │              │    │
                             ▼              │    │
                          ┌────┐            │    │
Row 10                    │Link│            │    │                  ◄── KEEP
                          │P-C │            │    │                      Link Person to Company
                          └──┬─┘            │    │
                             │              │    │
                             ▼              │    │
                          ┌────┐            │    │
Row 11                    │Note│            │    │                  ◄── KEEP
                          │    │            │    │                      Create Note
                          └──┬─┘            │    │
                             │              │    │
                             ▼              │    │
                          ┌────┐            │    │
Row 12                    │Succ│            │    │                  ◄── KEEP
                          │Res1│            │    │                      Success Response1
                          └────┘            │    │
                             ▲              │    │
                             │              │    │
                          ┌────┐            │    │
Row 13                    │Val │            │    │                  ◄── KEEP
                          │Err │            │    │                      Validation Error
                          └────┘            │    │
                                            │    │
```

---

## Connection Points Reference

### Node Input/Output Connections

| Node | Input From | Output To | Output 2 |
|------|------------|-----------|----------|
| Webhook1 | (trigger) | Validate & Process | - |
| Validate & Process | Webhook1 | Validation Check | - |
| Validation Check | Validate & Process | Create Person + Create Company (True) | Validation Error (False) |
| Create Person | Validation Check | Merge Results (Input 0) | - |
| Create Company | Validation Check | Merge Results (Input 1) | - |
| Merge Results | Create Person + Create Company | Extract IDs | - |
| Extract IDs | Merge Results | Link Person to Company | - |
| Link Person to Company | Extract IDs | Create Note | - |
| Create Note | Link Person to Company | Success Response1 | - |
| Success Response1 | Create Note | (terminal) | - |
| Validation Error | Validation Check | (terminal) | - |

---

## Color/Visual Indicators

### In n8n UI:

| Indicator | Meaning | Action |
|-----------|---------|--------|
| 🟢 Green node | Active, configured | Keep |
| 🔴 Red node | Error, needs attention | Check credentials |
| ⚪ Gray/Faded node | Inactive, disconnected | Likely DELETE |
| 🔵 Blue connection line | Active connection | Verify correct path |
| ❌ Red connection line | Broken/error | Check node exists |
| 📌 Pinned data | Test data attached | OK for testing |

---

## Quick Decision Tree

```
                    START: Click a node
                          │
                          ▼
                 Is it connected to
                 the main workflow?
                          │
              ┌───────────┴───────────┐
              │YES                    │NO
              ▼                       ▼
     Does it have "1" suffix   Is it named:
     (e.g., Webhook1)?         • Consultation Webhook
              │                • Success Response
       ┌──────┴──────┐         • HTTP Request
       │YES          │NO        • HTTP Request1
       ▼             ▼               │
    KEEP IT      KEEP IT            │
                  (Main flow)        ▼
                                  DELETE IT
```

---

*Visual guide for identifying nodes during cleanup*
