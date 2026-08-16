// Standalone SMS-parser verifier — "Unified Workspace v2" (2026-08-16). See
// tools/sms-parser-verifier/README.md and docs/mockups/proposals/sms-verifier-unified-workspace-v2.html.
// Runs the REAL production parser (packages/core/src/core/sms-import/smsParser.ts) entirely in the
// browser: nothing pasted here is ever transmitted anywhere.
//
// v2 layout, built for testing thousands of real messages per bank (the actual primary use case, not an
// edge case): left sidebar (banks + pinned "Bulk test"), middle column dedicated ENTIRELY to testing +
// results (paginated, chunked-parse-with-progress, searchable), right panel is a read-only reference of
// the selected bank's sender patterns + templates ("paper" cards). Editing/adding a template or sender
// pattern opens a popup — it never displaces the reference panel or the test column.
//
// This file is the rendering/orchestration layer only — the state/session model lives in `state.ts`, the
// capture-group highlighting primitives in `highlighting.ts`, and everything regex-drafting-related
// (compile checks, fuzzy suggestions, the helper panel) in `regexAuthoring.ts`. Split out 2026-08-16 after
// real feedback that one long file was making edits slower and more error-prone than they needed to be.
import { traceSms, redactDigits, type SmsParseTrace } from '@/core/sms-import/smsParser';
import { SMS_PATTERNS_FALLBACK, type SmsPatternBundle, type BankSmsPatternSet } from '@/core/sms-import/smsPatterns';
import { el, copyText, downloadTextFile, initToast, showToast } from './dom';
import {
  highlightedText,
  highlightedPattern,
  markedTableCell,
  markedNodes,
  captureRangesToSpans,
  fieldChips
} from './highlighting';
import {
  tryCompile,
  singleTemplateBundle,
  forcedBankBundle,
  suggestBankForSender,
  findSenderPatternOverlap,
  escapeRegExp,
  renderPatternFieldWithHelper,
  buildTemplateFormFields,
  currentTemplateFromFields,
  findUnrecognizedGroupNames,
  findUncatalogedGroupPatterns
} from './regexAuthoring';
import {
  RECEIVED_AT,
  session,
  saveSession,
  baseBundle,
  baseBundleLabel,
  setBaseBundle,
  officialCountFor,
  effectiveBundle,
  effectiveBundleForTesting,
  isTemplateDisabled,
  toggleTemplateDisabled,
  getDraftSample,
  setDraftSample,
  saveSnippet,
  samplesByBank,
  bankPassState,
  selection,
  setSelection,
  modal,
  setModal,
  bankFilterQuery,
  setBankFilterQuery,
  bulkRaw,
  setBulkRaw,
  bulkState,
  bankTesterFor,
  type ModalState,
  type ResultFilter,
  type TestResult,
  type ResultsTableState
} from './state';

// ── Sidebar ──────────────────────────────────────────────────────────────────────────────────────────

function renderSidebarContents(): Node[] {
  const bundle = effectiveBundle();
  const nodes: Node[] = [];

  const searchInput = el('input', { value: bankFilterQuery, placeholder: 'Filter banks…' });
  searchInput.addEventListener('input', () => {
    setBankFilterQuery(searchInput.value);
    renderSidebarInto();
  });
  nodes.push(el('div', { className: 'searchbox' }, [el('i', { className: 'ti ti-search' }), searchInput]));

  const bulkRow = el('div', { className: 'pinrow' }, [el('i', { className: 'ti ti-bolt' }), 'Bulk test — all banks']);
  bulkRow.addEventListener('click', () => {
    setSelection({ kind: 'bulk' });
    renderAll();
  });
  nodes.push(bulkRow);

  const query = bankFilterQuery.trim().toLowerCase();
  const filteredBanks = bundle.banks.filter((b) => !query || b.bankId.includes(query));
  nodes.push(el('div', { className: 'navlbl' }, [`Banks (${bundle.banks.length})`]));
  for (const bank of filteredBanks) {
    const state = bankPassState(bank.bankId);
    const isNewBank = session.newBankIds.includes(bank.bankId);
    const modifiedCount = Object.keys(session.overrides[bank.bankId] ?? {}).length;
    const draftCount = (session.newTemplates[bank.bankId] ?? []).length;
    const active = selection.kind === 'bank' && selection.bankId === bank.bankId;
    const row = el('div', { className: `bankrow${active ? ' active' : ''}` }, [
      el('span', {
        className: 'dot',
        style: {
          background: state === 'pass' ? '#059669' : state === 'partial' ? '#b45309' : isNewBank ? '#2563eb' : '#c2c8d1'
        }
      }),
      bank.bankId.toUpperCase(),
      el('span', { className: 'cnt' }, [
        `${bank.templates.length}`,
        ...(isNewBank ? [el('span', { className: 'minipill draft' }, ['new'])] : []),
        ...(modifiedCount ? [el('span', { className: 'minipill modified' }, [`${modifiedCount}✎`])] : []),
        ...(draftCount && !isNewBank ? [el('span', { className: 'minipill draft' }, [`+${draftCount}`])] : [])
      ])
    ]);
    row.addEventListener('click', () => {
      setSelection({ kind: 'bank', bankId: bank.bankId });
      renderAll();
    });
    nodes.push(row);
  }

  const newBankRow = el('div', { className: 'newbankrow' }, [el('i', { className: 'ti ti-plus' }), 'New bank…']);
  // A real in-tool popup, not a native browser prompt() — consistent with every other action in the tool.
  newBankRow.addEventListener('click', () => {
    setModal({ kind: 'newBank' });
    renderModalRoot();
  });
  nodes.push(newBankRow);

  const foot = el('div', { className: 'sidefoot' });
  const exportBtn = el('div', { className: 'footbtn' }, [
    el('i', { className: 'ti ti-download' }),
    'Export all patterns'
  ]);
  exportBtn.addEventListener('click', () => {
    setModal({ kind: 'export' });
    renderModalRoot();
  });
  const importBtn = el('div', { className: 'footbtn' }, [el('i', { className: 'ti ti-upload' }), 'Import patterns']);
  importBtn.addEventListener('click', () => {
    setModal({ kind: 'import' });
    renderModalRoot();
  });
  foot.append(exportBtn, importBtn);
  nodes.push(foot);

  return nodes;
}

function renderSidebarInto() {
  sideEl.replaceChildren(...renderSidebarContents());
}

// ── Right panel: read-only reference — sender patterns + template "paper" cards ─────────────────────────

function renderRightPanel(): Node[] {
  if (selection.kind !== 'bank') {
    return [
      el('div', { className: 'muted' }, ['Select a bank to see its configured sender patterns and templates here.'])
    ];
  }
  const bankId = selection.bankId;
  const bundle = effectiveBundle();
  const bank = bundle.banks.find((b) => b.bankId === bankId);
  if (!bank) return [el('div', { className: 'muted' }, [`Bank "${bankId}" not found.`])];
  const isNewBank = session.newBankIds.includes(bankId);
  const officialCount = isNewBank ? 0 : officialCountFor(bankId);
  const samples = samplesByBank().get(bankId) ?? [];

  const nodes: Node[] = [];

  const senderHead = el('div', { className: 'rightsub withedit' }, [el('span', {}, ['Sender ID patterns'])]);
  const editSendersBtn = el('span', { className: 'rightedit' }, ['Edit']);
  editSendersBtn.addEventListener('click', () => {
    setModal({ kind: 'senders', bankId });
    renderModalRoot();
  });
  senderHead.append(editSendersBtn);
  nodes.push(senderHead);
  nodes.push(
    el(
      'div',
      { className: 'senderref' },
      bank.senderIdPatterns.length === 0
        ? [el('span', { className: 'muted' }, ['No sender patterns configured yet.'])]
        : bank.senderIdPatterns.map((p) => el('code', {}, [p]))
    )
  );

  const modifiedCount = Object.keys(session.overrides[bankId] ?? {}).length;
  const draftCount = (session.newTemplates[bankId] ?? []).length;
  const countLabel = `(${officialCount - modifiedCount} official${modifiedCount ? `, ${modifiedCount} modified` : ''}${draftCount ? `, ${draftCount} draft` : ''})`;
  nodes.push(
    el('div', { className: 'rightsub' }, [
      `Templates ${bank.templates.length} `,
      el('span', { className: 'cnt' }, [countLabel])
    ])
  );

  bank.templates.forEach((template, index) => {
    const kind: 'official' | 'modified' | 'draft' =
      index >= officialCount ? 'draft' : session.overrides[bankId]?.[index] ? 'modified' : 'official';
    const disabled = isTemplateDisabled(bankId, index);
    // A tester's own saved test message (from the modal) takes priority — this is what lets a
    // session-added template show a real sample at all, and lets a corrected sample for an official one
    // stick beyond the modal it was typed in.
    const sample = getDraftSample(bankId, index) ?? (index < officialCount ? samples[index] : undefined);
    const trace = sample ? traceSms(sample.sender, sample.body, RECEIVED_AT, bundle) : null;
    const attempt = trace?.attempts.find(
      (a) => a.transactionType === template.transactionType && a.addedAt === template.addedAt
    );

    const kindLabel = kind === 'official' ? 'official' : kind === 'modified' ? 'modified' : 'draft';
    const top = el('div', { className: 'ptop' }, [
      el('b', {}, [`Template ${index + 1}`]),
      el('span', { className: 'era' }, [template.addedAt]),
      el('span', { className: `minipill ${kind}` }, [kindLabel]),
      ...(disabled ? [el('span', { className: 'minipill disabled' }, ['disabled'])] : []),
      el('span', { className: 'spacer' }),
      ...(attempt
        ? [
            el('span', { className: `minipill ${attempt.matched ? 'pass' : 'warn'}` }, [
              attempt.matched ? '✓ Parsed' : '✗ No match'
            ])
          ]
        : [])
    ]);

    const copyBtn = el('span', { className: 'paperlink' }, ['Copy regex']);
    copyBtn.addEventListener('click', () => {
      copyText(template.pattern);
      showToast('Regex copied to clipboard');
    });
    const editBtn = el('span', { className: 'paperlink' }, ['Edit']);
    editBtn.addEventListener('click', () => {
      setModal({ kind: 'template', bankId, index });
      renderModalRoot();
    });
    // Disabling (rather than deleting) is for "I want to see what my active config does without this
    // template, without losing it" — it stays right here, dimmed, one click from being re-enabled.
    const toggleDisableBtn = el('span', { className: 'paperlink' }, [disabled ? 'Enable' : 'Disable']);
    toggleDisableBtn.addEventListener('click', () => {
      toggleTemplateDisabled(bankId, index);
      renderAll();
    });
    const actionsRow = el('div', { className: 'paperactions' }, [copyBtn, editBtn, toggleDisableBtn]);
    if (kind === 'draft') {
      const deleteBtn = el('span', { className: 'paperlink danger' }, ['Delete']);
      deleteBtn.addEventListener('click', () => {
        session.newTemplates[bankId]?.splice(index - officialCount, 1);
        saveSession();
        renderAll();
      });
      actionsRow.append(deleteBtn);
    }

    const card = el('div', { className: `papercard${disabled ? ' disabled' : ''}` }, [
      top,
      highlightedPattern(template.pattern)
    ]);
    if (sample) {
      card.append(
        el('div', { className: 'papersample' }, markedNodes(sample.body, captureRangesToSpans(attempt?.captureRanges)))
      );
      if (attempt?.matched && attempt.candidate) card.append(fieldChips(attempt.candidate, attempt.captureRanges));
    } else {
      card.append(
        el('div', { className: 'muted', style: { fontSize: '10px' } }, [
          'No sample on file — verify it in the test column.'
        ])
      );
    }
    card.append(actionsRow);
    nodes.push(card);
  });

  const addCard = el('div', { className: 'addtplbtn' }, [`+ Add a new template for ${bankId.toUpperCase()}`]);
  addCard.addEventListener('click', () => {
    setModal({ kind: 'template', bankId, index: 'new' });
    renderModalRoot();
  });
  nodes.push(addCard);

  return nodes;
}

function renderRightPanelInto() {
  rightEl.replaceChildren(...renderRightPanel());
}

// ── Modal: Edit/Add template — full form + regex helper + live preview + test-message box ───────────────

function renderTemplateModal(m: Extract<ModalState, { kind: 'template' }>): HTMLElement {
  const bundle = effectiveBundle();
  const bank = bundle.banks.find((b) => b.bankId === m.bankId);
  const officialCount = officialCountFor(m.bankId);
  const isNew = m.index === 'new';
  const existing = !isNew && bank ? bank.templates[m.index as number] : undefined;
  const kind: 'new' | 'official' | 'modified' | 'draft' = isNew
    ? 'new'
    : (m.index as number) >= officialCount
      ? 'draft'
      : session.overrides[m.bankId]?.[m.index as number]
        ? 'modified'
        : 'official';
  const originalSample =
    !isNew && (m.index as number) < officialCount ? samplesByBank().get(m.bankId)?.[m.index as number] : undefined;
  // A tester's own previously-saved test message (from an earlier visit to this SAME template's modal)
  // takes priority over the official sample — this is what makes the test box come back populated when
  // reopening a template to edit it further, instead of going blank (it's keyed by the same effective
  // index the right panel's own sample lookup already uses).
  const savedSample = !isNew ? getDraftSample(m.bankId, m.index as number) : undefined;

  const fields = buildTemplateFormFields(
    existing ?? { transactionType: 'debit', dateFormat: '', addedAt: '', pattern: '' }
  );
  const previewBox = el('div', {});

  // ONE editable "test against" box, always — pre-filled from a tester's own previously-saved sample for
  // THIS template if one exists, else the template's own original sample when editing an official one, or
  // from the pre-fill passed in from a results-row action, or blank for a fresh draft. Previously the
  // original sample was shown read-only with no way to correct/replace it, and a brand-new/draft template
  // silently tested against a sender catch-all (`.*`) instead of this bank's REAL sender patterns — so
  // typing a sender that wouldn't actually be recognized never showed as such. Both gaps are fixed by
  // making this one box, always editable, always tested against the bank's real (or, if truly none
  // configured yet, a catch-all) sender patterns.
  const testSenderInput = el('input', {
    value: m.prefillSender ?? savedSample?.sender ?? originalSample?.sender ?? m.bankId.toUpperCase(),
    placeholder: 'e.g. VM-SBIINB'
  });
  const testBodyTa = el('textarea', {
    rows: 2,
    value: m.prefillBody ?? savedSample?.body ?? originalSample?.body ?? '',
    placeholder: 'Paste one message to test your draft against…'
  });
  const realSenderPatterns = bank?.senderIdPatterns?.length ? bank.senderIdPatterns : ['.*'];

  function updatePreview() {
    const compiled = tryCompile(fields.patternTa.value);
    fields.patternStatus.className = compiled.ok ? 'regexstatus ok' : 'regexstatus err';
    fields.patternStatus.replaceChildren(
      el('i', { className: `ti ti-circle-${compiled.ok ? 'check' : 'x'}` }),
      compiled.ok ? ' Valid regex syntax' : ` Invalid: ${compiled.error}`
    );

    // A named group whose name the real parser doesn't recognize compiles fine and highlights fine here
    // (the pattern preview colors ANY named group), but its value is silently dropped in production —
    // never read into the parsed candidate, never highlighted in a real test message. This is the direct
    // answer to "why isn't my account number highlighted below," instead of leaving it a silent mystery.
    const unrecognized = compiled.ok ? findUnrecognizedGroupNames(fields.patternTa.value) : [];
    fields.patternWarning.replaceChildren(
      ...(unrecognized.length > 0
        ? [
            el('div', { className: 'regexstatus warn' }, [
              el('i', { className: 'ti ti-alert-triangle' }),
              ` Unrecognized field name(s): ${unrecognized.join(', ')} — the real parser only reads amount, acctLast4, cardLast4, counterparty, ref, balance, dateStr. Anything else compiles fine but is silently ignored: not extracted, not highlighted, in production.`
            ])
          ]
        : [])
    );

    const left = el('div', {}, [
      el('div', { className: 'minilabel' }, ['Your regex']),
      highlightedPattern(fields.patternTa.value)
    ]);

    let statusEl: HTMLElement;
    let msgEl: HTMLElement | null = null;
    if (!testBodyTa.value.trim()) {
      statusEl = el('div', { className: 'muted' }, ['Paste a message above to check your regex live.']);
    } else if (compiled.ok) {
      const draftTemplate = currentTemplateFromFields(fields, existing?.addedAt ?? 'draft');
      const testBundle = singleTemplateBundle(m.bankId, draftTemplate, realSenderPatterns);
      const trace = traceSms(
        testSenderInput.value || m.bankId.toUpperCase(),
        testBodyTa.value,
        RECEIVED_AT,
        testBundle
      );
      const attempt = trace.attempts[0];
      const matched = trace.outcome.kind === 'parsed' && !!attempt?.matched;
      msgEl = highlightedText(testBodyTa.value, attempt?.captureRanges);
      if (trace.matchedSenderBanks.length === 0) {
        // Same distinction established for the bulk/bank testers — a sender-pattern miss never even
        // reaches the regex, and collapsing that into "no match" would hide a real, fixable gap.
        statusEl = el('span', { className: 'pill warn' }, ['✗ sender not recognized']);
      } else {
        statusEl = el('span', { className: `pill ${matched ? 'pass' : 'warn'}` }, [
          matched ? '✓ matches' : '✗ no match'
        ]);
      }
    } else {
      msgEl = highlightedText(testBodyTa.value, undefined);
      statusEl = el('span', { className: 'pill warn' }, ['✗ invalid regex']);
    }
    const right = el('div', {}, [
      el('div', { className: 'minilabel' }, ['Test message ', statusEl]),
      msgEl ?? el('div', {})
    ]);
    previewBox.replaceChildren(el('div', { className: 'regexmsg-grid' }, [left, right]));
  }
  fields.patternTa.addEventListener('input', updatePreview);
  fields.typeSelect.addEventListener('change', updatePreview);
  fields.dateFormatInput.addEventListener('input', updatePreview);
  fields.labelInput.addEventListener('input', updatePreview);
  testSenderInput.addEventListener('input', updatePreview);
  testBodyTa.addEventListener('input', updatePreview);
  updatePreview();

  const saveBtn = el('div', { className: 'formbtn primary' }, [
    isNew ? 'Save template' : kind === 'official' ? 'Save override' : 'Save changes'
  ]);
  saveBtn.addEventListener('click', () => {
    if (!fields.patternTa.value.trim()) return;
    const newTemplate = currentTemplateFromFields(
      fields,
      isNew ? `draft, ${new Date().toISOString().slice(0, 10)}` : (existing?.addedAt ?? '')
    );
    let effectiveIndex: number;
    if (isNew) {
      const arr = [...(session.newTemplates[m.bankId] ?? []), newTemplate];
      session.newTemplates[m.bankId] = arr;
      effectiveIndex = officialCount + arr.length - 1;
    } else if (kind === 'draft') {
      const arr = session.newTemplates[m.bankId] ?? [];
      arr[(m.index as number) - officialCount] = newTemplate;
      session.newTemplates[m.bankId] = arr;
      effectiveIndex = m.index as number;
    } else {
      session.overrides[m.bankId] ??= {};
      session.overrides[m.bankId][m.index as number] = newTemplate;
      effectiveIndex = m.index as number;
    }
    // Persists whatever was in the test box as this template's own reference sample — the only way a
    // session-added template (which has no official sample at all) ever gets one, and lets a corrected
    // sample for an official template stick beyond this one modal session.
    if (testBodyTa.value.trim()) {
      setDraftSample(m.bankId, effectiveIndex, {
        sender: testSenderInput.value || m.bankId.toUpperCase(),
        body: testBodyTa.value
      });
    }
    saveSession();
    renderRightPanelInto();
    renderSidebarInto();
    // A newly-written field pattern that isn't in the Common Patterns library yet gets one more chance
    // to be catalogued for reuse before the modal actually closes — never blocks/forces it, just offers.
    const suggestions = findUncatalogedGroupPatterns(newTemplate.pattern);
    if (suggestions.length === 0) {
      setModal(null);
      renderModalRoot();
    } else {
      mbodyEl.replaceChildren(
        renderSnippetSuggestionPanel(suggestions, () => {
          setModal(null);
          renderModalRoot();
        })
      );
    }
  });
  const cancelBtn = el('div', { className: 'formbtn ghost' }, ['Cancel']);
  cancelBtn.addEventListener('click', () => {
    setModal(null);
    renderModalRoot();
  });
  const closeBtn = el('span', { className: 'x' }, ['✕']);
  closeBtn.addEventListener('click', () => {
    setModal(null);
    renderModalRoot();
  });

  const title = isNew
    ? `Add a new template for ${m.bankId.toUpperCase()}`
    : `Edit template — ${m.bankId.toUpperCase()}`;

  const body: HTMLElement[] = [
    el('div', { className: 'formrow3' }, [
      el('div', { className: 'formfield' }, [el('label', {}, ['Transaction type']), fields.typeSelect]),
      el('div', { className: 'formfield' }, [el('label', {}, ['Date format (if any)']), fields.dateFormatInput]),
      el('div', { className: 'formfield' }, [el('label', {}, ['Label']), fields.labelInput])
    ]),
    // Test sender/body render BELOW the pattern field, in the same left column — filling the space the
    // (taller) regex helper panel already occupies on the right, instead of needing their own separate
    // full-width row further down the modal.
    renderPatternFieldWithHelper(fields.patternTa, fields.patternStatus, fields.patternWarning, [
      el('div', { className: 'formfield' }, [el('label', {}, ['Test sender']), testSenderInput]),
      el('div', { className: 'formfield' }, [
        el('label', {}, [
          originalSample ? 'Test message body (from the original sample — editable)' : 'Test message body'
        ]),
        testBodyTa
      ])
    ]),
    previewBox
  ];

  const mbodyEl = el('div', { className: 'mbody' }, body);

  return el('div', { className: 'modal-backdrop active' }, [
    el('div', { className: 'modal', style: { width: '760px' } }, [
      el('div', { className: 'mtop' }, [el('h4', {}, [title]), closeBtn]),
      mbodyEl,
      el('div', { className: 'mfoot' }, [cancelBtn, saveBtn])
    ])
  ]);
}

/** Shown in place of the template form after Save, only when the just-saved pattern used a named-group
 *  sub-pattern not already represented in the Common Patterns library — offers to catalog each one for
 *  reuse before the modal actually closes, never forced. */
function renderSnippetSuggestionPanel(
  suggestions: { name: string; fragment: string }[],
  onDone: () => void
): HTMLElement {
  const rows = suggestions.map(({ name, fragment }) => {
    const addBtn = el('div', { className: 'formbtn primary', style: { marginTop: '4px' } }, [
      '+ Add to Common Patterns'
    ]);
    addBtn.addEventListener('click', () => {
      saveSnippet('new', { label: name, snippet: fragment });
      addBtn.replaceWith(
        el('div', { className: 'regexstatus ok', style: { marginTop: '4px' } }, [
          el('i', { className: 'ti ti-circle-check' }),
          ' Added to Common Patterns.'
        ])
      );
    });
    return el('div', { style: { marginBottom: '10px' } }, [
      el('div', { className: 'snippetrow' }, [el('span', { className: 'lbl' }, [el('b', {}, [name])])]),
      el('div', { className: 'cheatcode' }, [fragment]),
      addBtn
    ]);
  });
  const doneBtn = el('div', { className: 'formbtn primary' }, ['Done']);
  doneBtn.addEventListener('click', onDone);
  return el('div', {}, [
    el('div', { className: 'regexstatus ok' }, [el('i', { className: 'ti ti-circle-check' }), ' Template saved.']),
    el('div', { className: 'htitle', style: { marginTop: '10px' } }, [
      'New field pattern(s) not yet in your Common Patterns library'
    ]),
    ...rows,
    el('div', { className: 'formbtnrow' }, [doneBtn])
  ]);
}

// ── Modal: Edit sender ID patterns — official (locked) + custom (removable), live overlap warning ───────

function renderSenderModal(m: Extract<ModalState, { kind: 'senders' }>): HTMLElement {
  const bankId = m.bankId;
  const isNewBank = session.newBankIds.includes(bankId);
  const official = isNewBank ? [] : (baseBundle.banks.find((b) => b.bankId === bankId)?.senderIdPatterns ?? []);

  const chipsWrap = el('div', { className: 'senderbox' });
  function renderChips() {
    const extra = session.extraSenderPatterns[bankId] ?? [];
    const chips: HTMLElement[] = official.map((p) =>
      el('span', { className: 'patchip' }, [el('i', { className: 'ti ti-lock' }), p])
    );
    extra.forEach((p, i) => {
      const x = el('span', { className: 'x' }, ['✕']);
      x.addEventListener('click', () => {
        session.extraSenderPatterns[bankId] = extra.filter((_, idx) => idx !== i);
        saveSession();
        renderChips();
        renderRightPanelInto();
      });
      chips.push(el('span', { className: 'patchip custom' }, [p, x]));
    });
    chipsWrap.replaceChildren(...chips, input);
  }

  const input = el('input', { className: 'addpatinput', placeholder: '+ add another sender pattern, e.g. ^SBIPSG$' });
  const warnBox = el('div', {});
  input.addEventListener('input', () => {
    const value = input.value.trim();
    if (!value) {
      warnBox.replaceChildren();
      return;
    }
    const compiled = tryCompile(value);
    if (!compiled.ok) {
      warnBox.replaceChildren(
        el('div', { className: 'regexstatus err' }, [
          el('i', { className: 'ti ti-alert-triangle' }),
          ` Invalid regex: ${compiled.error}`
        ])
      );
      return;
    }
    const overlapBank = findSenderPatternOverlap(value, bankId, effectiveBundle());
    warnBox.replaceChildren(
      ...(overlapBank
        ? [
            el('div', { className: 'regexstatus err' }, [
              el('i', { className: 'ti ti-alert-triangle' }),
              ` This would also match under ${overlapBank.toUpperCase()}'s existing patterns — double-check which bank actually owns this sender before adding it.`
            ])
          ]
        : [])
    );
  });
  input.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    const value = input.value.trim();
    if (!value || !tryCompile(value).ok) return;
    session.extraSenderPatterns[bankId] = [...(session.extraSenderPatterns[bankId] ?? []), value];
    saveSession();
    input.value = '';
    warnBox.replaceChildren();
    renderChips();
    renderRightPanelInto();
  });

  renderChips();

  const doneBtn = el('div', { className: 'formbtn primary' }, ['Done']);
  const close = () => {
    setModal(null);
    renderModalRoot();
  };
  doneBtn.addEventListener('click', close);
  const closeBtn = el('span', { className: 'x' }, ['✕']);
  closeBtn.addEventListener('click', close);

  return el('div', { className: 'modal-backdrop active' }, [
    el('div', { className: 'modal', style: { width: '460px' } }, [
      el('div', { className: 'mtop' }, [el('h4', {}, [`Sender ID patterns — ${bankId.toUpperCase()}`]), closeBtn]),
      el('div', { className: 'mbody' }, [
        chipsWrap,
        warnBox,
        el('div', { className: 'hint', style: { marginTop: '8px' } }, [
          '🔒 = official (real production coverage, not removable). New patterns are checked live against every other bank’s patterns.'
        ])
      ]),
      el('div', { className: 'mfoot' }, [doneBtn])
    ])
  ]);
}

// ── Modals: Export / Import ──────────────────────────────────────────────────────────────────────────────

function renderExportModal(scopeBankId?: string): HTMLElement {
  const full = effectiveBundle();
  const bundle = scopeBankId
    ? { version: full.version, banks: full.banks.filter((b) => b.bankId === scopeBankId) }
    : full;
  const json = JSON.stringify(bundle, null, 2);
  const close = () => {
    setModal(null);
    renderModalRoot();
  };
  const closeBtn = el('span', { className: 'x' }, ['✕']);
  closeBtn.addEventListener('click', close);
  const copyBtn = el('div', { className: 'formbtn primary' }, ['Copy JSON']);
  copyBtn.addEventListener('click', () => {
    copyText(json);
    showToast('JSON copied to clipboard');
  });
  const filename = scopeBankId ? `sms-patterns-${scopeBankId}.json` : 'sms-patterns.json';
  const downloadBtn = el('div', { className: 'formbtn ghost' }, [`Download ${filename}`]);
  downloadBtn.addEventListener('click', () => downloadTextFile(filename, json));

  const title = scopeBankId ? `Export ${scopeBankId.toUpperCase()} only` : 'Export all patterns';
  const note = scopeBankId
    ? `Just ${scopeBankId.toUpperCase()}'s official data, overrides, and drafts — same SMS_PATTERN_BUNDLE-shaped JSON as the full export, filtered to one bank.`
    : `Includes every official bank, your session's overrides, and every draft template/bank — matches workers/api-proxy/src/smsPatterns.ts's SMS_PATTERN_BUNDLE shape exactly (${bundle.banks.length} banks).`;

  return el('div', { className: 'modal-backdrop active' }, [
    el('div', { className: 'modal' }, [
      el('div', { className: 'mtop' }, [el('h4', {}, [title]), closeBtn]),
      el('div', { className: 'mbody' }, [
        el('div', { className: 'hint' }, [note]),
        el('pre', { className: 'jsonpre' }, [json])
      ]),
      el('div', { className: 'mfoot' }, [downloadBtn, copyBtn])
    ])
  ]);
}

function renderImportModal(): HTMLElement {
  const close = () => {
    setModal(null);
    renderModalRoot();
  };
  const closeBtn = el('span', { className: 'x' }, ['✕']);
  closeBtn.addEventListener('click', close);

  const textarea = el('textarea', { placeholder: 'Paste exported JSON here…', style: { minHeight: '70px' } });
  const fileInput = el('input', { type: 'file', accept: '.json', style: { display: 'none' } });
  fileInput.addEventListener('change', () => {
    const file = fileInput.files?.[0];
    if (!file) return;
    void file.text().then((text) => (textarea.value = text));
  });
  const uploadBtn = el('div', { className: 'smallbtn' }, [
    el('i', { className: 'ti ti-file-upload' }),
    'Upload a .json file instead'
  ]);
  uploadBtn.addEventListener('click', () => fileInput.click());

  const statusBox = el('div', {});
  const importBtn = el('div', { className: 'formbtn primary' }, ['Import into this session']);
  importBtn.addEventListener('click', () => {
    try {
      const parsed = JSON.parse(textarea.value) as Partial<SmsPatternBundle>;
      if (!Array.isArray(parsed.banks)) throw new Error('Not a valid pattern bundle (missing banks[])');
      let bankCount = 0;
      let templateCount = 0;
      for (const bank of parsed.banks) {
        bankCount++;
        const knownBank = baseBundle.banks.find((b) => b.bankId === bank.bankId);
        if (!knownBank && !session.newBankIds.includes(bank.bankId)) session.newBankIds.push(bank.bankId);
        const knownPatterns = new Set([
          ...(knownBank?.senderIdPatterns ?? []),
          ...(session.extraSenderPatterns[bank.bankId] ?? [])
        ]);
        for (const p of bank.senderIdPatterns ?? []) {
          if (!knownPatterns.has(p)) {
            session.extraSenderPatterns[bank.bankId] = [...(session.extraSenderPatterns[bank.bankId] ?? []), p];
            knownPatterns.add(p);
          }
        }
        const templates = bank.templates ?? [];
        session.newTemplates[bank.bankId] = [...(session.newTemplates[bank.bankId] ?? []), ...templates];
        templateCount += templates.length;
      }
      saveSession();
      statusBox.replaceChildren(
        el('div', { className: 'regexstatus ok' }, [
          el('i', { className: 'ti ti-circle-check' }),
          ` Imported ${bankCount} bank(s), ${templateCount} template(s) as drafts.`
        ])
      );
      renderAll();
    } catch (err) {
      statusBox.replaceChildren(
        el('div', { className: 'regexstatus err' }, [
          el('i', { className: 'ti ti-alert-triangle' }),
          ` Import failed: ${err instanceof Error ? err.message : String(err)}`
        ])
      );
    }
  });

  return el('div', { className: 'modal-backdrop active' }, [
    el('div', { className: 'modal' }, [
      el('div', { className: 'mtop' }, [el('h4', {}, ['Import patterns']), closeBtn]),
      el('div', { className: 'mbody' }, [
        el('div', { className: 'hint' }, [
          'Paste JSON in the same shape, or upload a .json file. Every bank/template merges into your drafts — additive only, never replacing the bundled official fallback or an existing override.'
        ]),
        el('div', { className: 'console' }, [textarea]),
        el('div', { className: 'uploadrow', style: { marginTop: '8px' } }, [uploadBtn, fileInput]),
        statusBox
      ]),
      el('div', { className: 'mfoot' }, [importBtn])
    ])
  ]);
}

function renderNewBankModal(): HTMLElement {
  const bundle = effectiveBundle();
  const close = () => {
    setModal(null);
    renderModalRoot();
  };
  const closeBtn = el('span', { className: 'x' }, ['✕']);
  closeBtn.addEventListener('click', close);

  const idInput = el('input', { placeholder: 'e.g. kvb' });
  const errBox = el('div', {});
  const createBtn = el('div', { className: 'formbtn primary' }, ['Create bank']);
  createBtn.addEventListener('click', () => {
    const id = idInput.value.trim().toLowerCase();
    if (!id) {
      errBox.replaceChildren(
        el('div', { className: 'regexstatus err' }, [
          el('i', { className: 'ti ti-alert-triangle' }),
          ' Enter a bank ID.'
        ])
      );
      return;
    }
    if (bundle.banks.some((b) => b.bankId === id)) {
      errBox.replaceChildren(
        el('div', { className: 'regexstatus err' }, [
          el('i', { className: 'ti ti-alert-triangle' }),
          ` "${id}" already exists.`
        ])
      );
      return;
    }
    session.newBankIds.push(id);
    saveSession();
    setSelection({ kind: 'bank', bankId: id });
    setModal(null);
    renderModalRoot();
    renderAll();
  });
  idInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') createBtn.dispatchEvent(new Event('click'));
  });
  const cancelBtn = el('div', { className: 'formbtn ghost' }, ['Cancel']);
  cancelBtn.addEventListener('click', close);

  return el('div', { className: 'modal-backdrop active' }, [
    el('div', { className: 'modal', style: { width: '380px' } }, [
      el('div', { className: 'mtop' }, [el('h4', {}, ['New bank']), closeBtn]),
      el('div', { className: 'mbody' }, [
        el('div', { className: 'formfield' }, [el('label', {}, ['Bank ID (short, lowercase)']), idInput]),
        errBox
      ]),
      el('div', { className: 'mfoot' }, [cancelBtn, createBtn])
    ])
  ]);
}

function renderModalRoot() {
  modalRoot.replaceChildren();
  if (!modal) {
    modalRoot.style.display = 'none';
    return;
  }
  modalRoot.style.display = 'block';
  if (modal.kind === 'template') modalRoot.append(renderTemplateModal(modal));
  else if (modal.kind === 'senders') modalRoot.append(renderSenderModal(modal));
  else if (modal.kind === 'export') modalRoot.append(renderExportModal(modal.scopeBankId));
  else if (modal.kind === 'import') modalRoot.append(renderImportModal());
  else modalRoot.append(renderNewBankModal());
}

// ── Shared results table — paginated + searchable + chunked/progress-tracked parsing, used by BOTH the
// bank-scoped tester and the Bulk-test page (one implementation, not two) ──────────────────────────────

const FILTER_LABELS: Record<ResultFilter, string> = {
  all: 'Total tested',
  parsed: '✓ Parsed',
  partial: '⚠ Partial',
  unrecognized: '❌ Unrecognized',
  excluded: '🚫 Excluded'
};

function outcomeFilterKind(trace: SmsParseTrace): ResultFilter {
  if (trace.excludedAsOtp) return 'excluded';
  if (trace.outcome.kind === 'parsed') return 'parsed';
  if (trace.outcome.kind === 'unparsed_known_bank') return 'partial';
  return 'unrecognized';
}

function badgeFor(trace: SmsParseTrace): HTMLElement {
  const kind = outcomeFilterKind(trace);
  const map: Record<ResultFilter, [string, string]> = {
    all: ['', ''],
    parsed: ['pass', '✓ Parsed'],
    partial: ['warn', '⚠ Partial'],
    unrecognized: ['fail', '❌ Unrecognized'],
    excluded: ['muted', '🚫 Excluded']
  };
  const [cls, label] = map[kind];
  return el('span', { className: `badge ${cls}` }, [label]);
}

/** Compact at-a-glance trace — one dot per template attempted, colored by outcome (green = matched, red =
 *  tried and failed, gray = never reached because an earlier template already won). Shown as its own
 *  column so a parsed row conveys everything useful without needing to expand it at all. */
function renderTraceStrip(trace: SmsParseTrace): HTMLElement {
  if (trace.attempts.length === 0)
    return el('div', { className: 'tracestrip' }, [el('span', { className: 'tdot skipped' }, ['—'])]);
  return el(
    'div',
    { className: 'tracestrip' },
    trace.attempts.map((a, i) => {
      const cls = a.matched ? 'matched' : a.attempted ? 'tried' : 'skipped';
      return el('span', { className: `tdot ${cls}`, title: a.addedAt }, [String(i + 1)]);
    })
  );
}

interface ParsedBlock {
  sender: string;
  body: string;
}
function splitIntoBlocks(raw: string): ParsedBlock[] {
  return raw
    .split(/^\s*---\s*$/m)
    .map((chunk) => chunk.trim())
    .filter(Boolean)
    .map((chunk) => {
      const lines = chunk
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean);
      const [sender, ...bodyLines] = lines;
      return { sender: sender ?? '', body: bodyLines.join(' ') };
    })
    .filter((b) => b.sender && b.body);
}

/** Parses potentially thousands of messages WITHOUT a multi-second synchronous freeze — processes in
 *  batches, yielding back to the browser between them (so the tab stays responsive and a progress bar can
 *  actually animate), rather than one long blocking loop. */
function runBatchedTest(
  blocks: ParsedBlock[],
  computeTrace: (sender: string, body: string) => SmsParseTrace,
  onProgress: (done: number, total: number) => void,
  onDone: (results: TestResult[]) => void
) {
  const total = blocks.length;
  if (total === 0) {
    onDone([]);
    return;
  }
  const BATCH_SIZE = 500;
  const results: TestResult[] = [];
  let i = 0;
  function step() {
    const end = Math.min(total, i + BATCH_SIZE);
    for (; i < end; i++) {
      const block = blocks[i];
      if (!block) continue;
      results.push({ sender: block.sender, body: block.body, trace: computeTrace(block.sender, block.body) });
    }
    onProgress(i, total);
    if (i < total) {
      (window.requestAnimationFrame || setTimeout)(() => setTimeout(step, 0));
    } else {
      onDone(results);
    }
  }
  step();
}

function renderPaginationBar(state: ResultsTableState, filteredLength: number, onChange: () => void): HTMLElement {
  const totalPages = Math.max(1, Math.ceil(filteredLength / state.pageSize));
  if (state.page > totalPages) state.page = totalPages;
  const start = (state.page - 1) * state.pageSize;
  const info = el('span', {}, [
    `Showing ${filteredLength === 0 ? 0 : start + 1}–${Math.min(start + state.pageSize, filteredLength)} of ${filteredLength.toLocaleString()}`
  ]);
  const sizeSelect = el(
    'select',
    { className: 'pagesize' },
    [50, 100, 250, 500].map((n) => el('option', { value: String(n), selected: n === state.pageSize }, [`${n} / page`]))
  );
  sizeSelect.addEventListener('change', () => {
    state.pageSize = Number(sizeSelect.value);
    state.page = 1;
    onChange();
  });
  const btnsWrap = el('div', { className: 'pagebtns' });
  const first = Math.max(1, state.page - 2);
  const last = Math.min(totalPages, first + 4);
  for (let p = first; p <= last; p++) {
    const btn = el('div', { className: `pagebtn${p === state.page ? ' active' : ''}` }, [String(p)]);
    btn.addEventListener('click', () => {
      state.page = p;
      onChange();
    });
    btnsWrap.append(btn);
  }
  return el('div', { className: 'pagerow' }, [info, sizeSelect, btnsWrap]);
}

function renderResultsTableInto(container: HTMLElement, state: ResultsTableState) {
  // Nothing below the Test/Parse button until it's actually been clicked once — an empty stat strip +
  // "nothing tested yet" table before you've done anything was just noise.
  if (!state.hasRun) {
    container.replaceChildren();
    return;
  }

  const searchLower = state.search.trim().toLowerCase();
  const filtered = state.results.filter(
    (r) =>
      (state.filter === 'all' || outcomeFilterKind(r.trace) === state.filter) &&
      (!searchLower || `${r.sender} ${r.body}`.toLowerCase().includes(searchLower))
  );

  const rerender = () => renderResultsTableInto(container, state);

  const statStrip = el(
    'div',
    { className: 'statstrip' },
    (Object.keys(FILTER_LABELS) as ResultFilter[]).map((key) => {
      const count =
        key === 'all' ? state.results.length : state.results.filter((r) => outcomeFilterKind(r.trace) === key).length;
      const cls = key === 'parsed' ? 'pass' : key === 'partial' ? 'warn' : key === 'unrecognized' ? 'fail' : '';
      const card = el('div', { className: `statcard ${cls}${state.filter === key ? ' active' : ''}` }, [
        el('div', { className: 'n' }, [count.toLocaleString()]),
        el('div', { className: 'l' }, [FILTER_LABELS[key]])
      ]);
      card.addEventListener('click', () => {
        state.filter = key;
        state.page = 1;
        rerender();
      });
      return card;
    })
  );

  const searchInput = el('input', { value: state.search, placeholder: 'Search sender or message text…' });
  searchInput.addEventListener('input', () => {
    state.search = searchInput.value;
    state.page = 1;
    rerender();
  });
  const copyRedactedBtn = el('div', { className: 'smallbtn' }, [
    el('i', { className: 'ti ti-copy' }),
    'Copy (redacted)'
  ]);
  copyRedactedBtn.addEventListener('click', () => {
    copyText(
      filtered
        .map((r) => `[${FILTER_LABELS[outcomeFilterKind(r.trace)]}] ${redactDigits(r.sender)}: ${redactDigits(r.body)}`)
        .join('\n')
    );
    showToast(`Copied ${filtered.length.toLocaleString()} redacted result(s)`);
  });
  const copyUnredactedBtn = el('div', { className: 'smallbtn' }, [
    el('i', { className: 'ti ti-copy' }),
    'Copy (unredacted)'
  ]);
  copyUnredactedBtn.addEventListener('click', () => {
    copyText(filtered.map((r) => `[${FILTER_LABELS[outcomeFilterKind(r.trace)]}] ${r.sender}: ${r.body}`).join('\n'));
    showToast(`Copied ${filtered.length.toLocaleString()} result(s)`);
  });
  const toolsRow = el('div', { className: 'toolsrow' }, [
    el('div', { className: 'searchbox' }, [el('i', { className: 'ti ti-search' }), searchInput]),
    copyRedactedBtn,
    copyUnredactedBtn
  ]);

  const topPager = renderPaginationBar(state, filtered.length, rerender);

  const start = (state.page - 1) * state.pageSize;
  const pageItems = filtered.slice(start, start + state.pageSize);
  const table = el('table', { className: 'rtable' }, [
    el('thead', {}, [
      el('tr', {}, [
        el('th', {}, ['']),
        el('th', {}, ['Sender']),
        el('th', {}, ['Bank']),
        el('th', {}, ['Message']),
        el('th', {}, ['Trace']),
        el('th', {}, ['Status'])
      ])
    ]),
    el(
      'tbody',
      {},
      pageItems.length === 0
        ? [
            el('tr', {}, [
              el('td', { colSpan: 6, className: 'muted' }, [
                state.results.length === 0
                  ? 'Nothing tested yet — paste or upload messages above.'
                  : 'No results match this filter/search.'
              ])
            ])
          ]
        : pageItems.flatMap((result, i) => resultRows(result, start + i, container, state))
    )
  ]);

  const bottomPager = renderPaginationBar(state, filtered.length, rerender);

  container.replaceChildren(statStrip, toolsRow, topPager, table, bottomPager);
}

function resultRows(result: TestResult, idx: number, container: HTMLElement, state: ResultsTableState): HTMLElement[] {
  // The Trace column + the message cell's own highlighting already tell the whole story for a parsed
  // row — expanding it would just repeat the same highlighted text a second time for no new information.
  // Only Partial/Unrecognized/Excluded rows still expand, where there's real additional value (the full
  // per-template breakdown, a did-you-mean nudge, or an "add a template" action).
  const kind = outcomeFilterKind(result.trace);
  const expandable = kind !== 'parsed';
  const isExpanded = expandable && state.expandedIndex === idx;
  const winningAttempt = result.trace.attempts.find((a) => a.matched);
  const bankLabel = result.trace.matchedSenderBanks[0]?.toUpperCase() ?? '—';

  const copyIcon = el('i', { className: 'ti ti-copy rowcopy', title: 'Copy sender + message' });
  copyIcon.addEventListener('click', (e) => {
    e.stopPropagation();
    copyText(`${result.sender}\n${result.body}`);
    showToast('Copied — paste it into "Add a new template"');
  });

  const row = el('tr', { className: 'rrow' }, [
    el(
      'td',
      { className: 'chev' },
      expandable ? [el('i', { className: `ti ti-chevron-${isExpanded ? 'down' : 'right'}` })] : []
    ),
    el('td', { className: `sndcell ${result.trace.matchedSenderBanks.length > 0 ? 'recognized' : 'unrecognized'}` }, [
      result.sender
    ]),
    el('td', { className: 'bankcell' }, [bankLabel]),
    markedTableCell(result.body, winningAttempt?.captureRanges, copyIcon),
    el('td', { className: 'tracecell' }, [renderTraceStrip(result.trace)]),
    el('td', { className: 'badgecell' }, [badgeFor(result.trace)])
  ]);
  if (expandable) {
    row.addEventListener('click', () => {
      state.expandedIndex = isExpanded ? null : idx;
      renderResultsTableInto(container, state);
    });
  } else {
    row.style.cursor = 'default';
  }
  if (!isExpanded) return [row];

  const detail = el('td', { colSpan: 6 });
  if (result.trace.attempts.length > 0) {
    detail.append(
      el('div', { className: 'tracelbl' }, [
        `Match trace — sender recognized as ${bankLabel}, ${result.trace.attempts.length} template(s) checked`
      ])
    );
    for (const attempt of result.trace.attempts) {
      const verdict = !attempt.attempted
        ? el('span', { className: 'verdict no' }, ['— not tried (already matched)'])
        : attempt.matched
          ? el('span', { className: 'verdict yes' }, ['✓ MATCHED'])
          : el('span', { className: 'verdict no' }, ["✗ didn't match"]);
      detail.append(
        el('div', { className: 'traceattempt' }, [
          el('span', { className: 'num' }, ['•']),
          el('span', { className: 'lbl' }, [attempt.addedAt]),
          verdict
        ])
      );
    }
  } else if (!result.trace.excludedAsOtp) {
    detail.append(
      el('div', { className: 'muted' }, [
        'No configured bank recognized this sender — no templates were even attempted.'
      ])
    );
    const suggestion = suggestBankForSender(result.sender, effectiveBundle());
    if (suggestion) {
      detail.append(
        el('div', { className: 'regexstatus err', style: { marginTop: '6px' } }, [
          el('i', { className: 'ti ti-bulb' }),
          ` Did you mean ${suggestion.bankId.toUpperCase()}? "${result.sender}" shares "${suggestion.fragment}" with its existing sender patterns.`
        ])
      );
      const addSenderBtn = el('div', { className: 'formbtn primary' }, [
        `+ Add as a sender pattern for ${suggestion.bankId.toUpperCase()}`
      ]);
      addSenderBtn.addEventListener('click', () => {
        const bankId = suggestion.bankId;
        session.extraSenderPatterns[bankId] = [
          ...(session.extraSenderPatterns[bankId] ?? []),
          `^${escapeRegExp(result.sender)}$`
        ];
        saveSession();
        setSelection({ kind: 'bank', bankId });
        renderAll();
      });
      detail.append(el('div', { className: 'formbtnrow', style: { marginTop: '8px' } }, [addSenderBtn]));
    }
  }
  if (result.trace.outcome.kind === 'unparsed_known_bank') {
    const gapBankId = result.trace.outcome.bankId;
    const addTplBtn = el('div', { className: 'formbtn primary' }, [
      `+ Add a template for ${gapBankId.toUpperCase()}, pre-filled from this message`
    ]);
    addTplBtn.addEventListener('click', () => {
      setSelection({ kind: 'bank', bankId: gapBankId });
      setModal({
        kind: 'template',
        bankId: gapBankId,
        index: 'new',
        prefillSender: result.sender,
        prefillBody: result.body
      });
      renderAll();
      renderModalRoot();
    });
    detail.append(el('div', { className: 'formbtnrow', style: { marginTop: '10px' } }, [addTplBtn]));
  }
  return [row, el('tr', { className: 'exprow' }, [detail])];
}

// ── Bulk-test page (the sidebar's pinned "⚡ Bulk test — all banks" entry) ────────────────────────────────

function renderProgressWrap(): { el: HTMLElement; show: (done: number, total: number) => void; hide: () => void } {
  const bar = el('div', { style: { width: '0%' } });
  const text = el('span', {}, ['0 / 0']);
  const wrap = el('div', { className: 'progresswrap' }, [
    el('div', { className: 'progresslbl' }, [el('span', {}, ['Parsing…']), text]),
    el('div', { className: 'progressbar' }, [bar])
  ]);
  return {
    el: wrap,
    show(done, total) {
      wrap.classList.add('active');
      text.textContent = `${done.toLocaleString()} / ${total.toLocaleString()}`;
      bar.style.width = `${total === 0 ? 0 : (done / total) * 100}%`;
    },
    hide() {
      wrap.classList.remove('active');
    }
  };
}

function renderBulkTestMain(): HTMLElement {
  const bundle = effectiveBundleForTesting();
  const textarea = el('textarea', {
    value: bulkRaw,
    placeholder: 'VM-HDFCBK\nHDFC Bank: Rs.500.00 debited from a/c XX1234...'
  });
  textarea.addEventListener('input', () => setBulkRaw(textarea.value));

  const fileInput = el('input', { type: 'file', accept: '.txt', style: { display: 'none' } });
  fileInput.addEventListener('change', () => {
    const file = fileInput.files?.[0];
    if (!file) return;
    void file.text().then((text) => {
      textarea.value = textarea.value ? `${textarea.value}\n---\n${text}` : text;
      setBulkRaw(textarea.value);
    });
  });
  const uploadBtn = el('div', { className: 'smallbtn' }, [
    el('i', { className: 'ti ti-file-upload' }),
    'Upload a .txt file'
  ]);
  uploadBtn.addEventListener('click', () => fileInput.click());

  const progress = renderProgressWrap();
  const errorBox = el('div', {});
  const tableWrap = el('div', {});
  const parseBtn = el('button', { className: 'runbtn' }, [
    el('i', { className: 'ti ti-player-play-filled' }),
    ' Parse all'
  ]);
  parseBtn.addEventListener('click', () => {
    const blocks = splitIntoBlocks(textarea.value);
    // Nothing to test — a clear error, not an empty/all-zero results block rendering as if something ran.
    if (blocks.length === 0) {
      errorBox.replaceChildren(
        el('div', { className: 'regexstatus err', style: { marginTop: '8px' } }, [
          el('i', { className: 'ti ti-alert-triangle' }),
          ' Paste at least one message, or upload a .txt file, before testing.'
        ])
      );
      return;
    }
    errorBox.replaceChildren();
    progress.show(0, blocks.length);
    runBatchedTest(
      blocks,
      (sender, body) => traceSms(sender, body, RECEIVED_AT, bundle),
      (done, total) => progress.show(done, total),
      (results) => {
        progress.hide();
        bulkState.results = results;
        bulkState.filter = 'all';
        bulkState.search = '';
        bulkState.page = 1;
        bulkState.expandedIndex = null;
        bulkState.hasRun = true;
        renderResultsTableInto(tableWrap, bulkState);
        renderSidebarInto();
      }
    );
  });
  renderResultsTableInto(tableWrap, bulkState);

  return el('div', {}, [
    el('div', { className: 'midhead' }, [
      el('div', {}, [
        el('div', { className: 'breadcrumb' }, ['Bulk test']),
        el('h2', {}, ['Paste or upload messages — all banks'])
      ])
    ]),
    el('div', { className: 'console' }, [textarea]),
    el('div', { className: 'uploadrow' }, [
      el('div', { className: 'uploadleft' }, [
        uploadBtn,
        fileInput,
        el('span', { className: 'hint' }, [
          'Sender line, body, --- between messages — tested against every bank at once.'
        ])
      ]),
      parseBtn
    ]),
    errorBox,
    progress.el,
    tableWrap
  ]);
}

// ── Bank workspace — test column only (templates/sender-patterns live in the right panel now) ────────────

function renderBankTesterSection(bankId: string): HTMLElement {
  const bt = bankTesterFor(bankId);
  const textarea = el('textarea', {
    value: bt.raw,
    placeholder:
      "Any sender, any wording — one message per block, sender line first, then body. Try a sender this bank doesn't recognize yet, or switch to Force mode to test just the body."
  });
  textarea.addEventListener('input', () => (bt.raw = textarea.value));

  const fileInput = el('input', { type: 'file', accept: '.txt', style: { display: 'none' } });
  fileInput.addEventListener('change', () => {
    const file = fileInput.files?.[0];
    if (!file) return;
    void file.text().then((text) => {
      textarea.value = textarea.value ? `${textarea.value}\n---\n${text}` : text;
      bt.raw = textarea.value;
    });
  });
  const uploadBtn = el('div', { className: 'smallbtn' }, [
    el('i', { className: 'ti ti-file-upload' }),
    'Upload a .txt file'
  ]);
  uploadBtn.addEventListener('click', () => fileInput.click());

  const autoBtn = el('div', { className: `modechip${bt.mode === 'auto' ? ' active' : ''}` }, ['Auto-detect sender']);
  autoBtn.addEventListener('click', () => {
    bt.mode = 'auto';
    renderMain();
  });
  const forceBtn = el('div', { className: `modechip${bt.mode === 'force' ? ' active' : ''}` }, [
    `Force against ${bankId.toUpperCase()}'s templates`
  ]);
  forceBtn.addEventListener('click', () => {
    bt.mode = 'force';
    renderMain();
  });

  const progress = renderProgressWrap();
  const errorBox = el('div', {});
  const tableWrap = el('div', {});
  const testBtn = el('button', { className: 'runbtn' }, [el('i', { className: 'ti ti-player-play-filled' }), ' Test']);
  testBtn.addEventListener('click', () => {
    const blocks = splitIntoBlocks(textarea.value);
    // Nothing to test — a clear error, not an empty/all-zero results block rendering as if something ran.
    if (blocks.length === 0) {
      errorBox.replaceChildren(
        el('div', { className: 'regexstatus err', style: { marginTop: '8px' } }, [
          el('i', { className: 'ti ti-alert-triangle' }),
          ' Paste at least one message, or upload a .txt file, before testing.'
        ])
      );
      return;
    }
    errorBox.replaceChildren();
    const freshBundle = effectiveBundleForTesting();
    const freshBank = freshBundle.banks.find((b) => b.bankId === bankId);
    progress.show(0, blocks.length);
    runBatchedTest(
      blocks,
      (sender, body) =>
        bt.mode === 'auto'
          ? traceSms(sender, body, RECEIVED_AT, freshBundle)
          : traceSms(
              'FORCED',
              body,
              RECEIVED_AT,
              forcedBankBundle(freshBank ?? ({ bankId, senderIdPatterns: [], templates: [] } as BankSmsPatternSet))
            ),
      (done, total) => progress.show(done, total),
      (results) => {
        progress.hide();
        bt.state.results = results;
        bt.state.filter = 'all';
        bt.state.search = '';
        bt.state.page = 1;
        bt.state.expandedIndex = null;
        bt.state.hasRun = true;
        renderResultsTableInto(tableWrap, bt.state);
      }
    );
  });
  renderResultsTableInto(tableWrap, bt.state);

  return el('div', {}, [
    el('div', { className: 'modechips' }, [autoBtn, forceBtn]),
    el('div', { className: 'console' }, [textarea]),
    el('div', { className: 'uploadrow' }, [
      el('div', { className: 'uploadleft' }, [
        uploadBtn,
        fileInput,
        el('span', { className: 'hint' }, ['Same format as Bulk test.'])
      ]),
      testBtn
    ]),
    errorBox,
    progress.el,
    tableWrap
  ]);
}

function renderBankWorkspace(bankId: string): HTMLElement {
  const bundle = effectiveBundle();
  const bank = bundle.banks.find((b) => b.bankId === bankId);
  if (!bank) return el('div', { className: 'muted' }, [`Bank "${bankId}" not found.`]);

  const exportBankBtn = el('div', { className: 'smallbtn' }, [
    el('i', { className: 'ti ti-download' }),
    `Export ${bankId.toUpperCase()} only`
  ]);
  // Opens the same Export modal as the sidebar's "Export all patterns" (Copy JSON + Download), scoped to
  // just this bank — previously this only copied to clipboard with no way to actually download the file.
  exportBankBtn.addEventListener('click', () => {
    setModal({ kind: 'export', scopeBankId: bankId });
    renderModalRoot();
  });

  return el('div', {}, [
    el('div', { className: 'midhead' }, [
      el('div', {}, [el('div', { className: 'breadcrumb' }, ['Bank workspace']), el('h2', {}, [bankId.toUpperCase()])]),
      exportBankBtn
    ]),
    renderBankTesterSection(bankId)
  ]);
}

// ── Top-level render ─────────────────────────────────────────────────────────────────────────────────

let root: HTMLElement;
let sideEl: HTMLElement;
let midEl: HTMLElement;
let rightEl: HTMLElement;
let modalRoot: HTMLElement;

function renderMain() {
  midEl.replaceChildren(selection.kind === 'bulk' ? renderBulkTestMain() : renderBankWorkspace(selection.bankId));
}

function renderAll() {
  renderSidebarInto();
  renderMain();
  renderRightPanelInto();
}

function renderSourceControl(): HTMLElement {
  const status = el('span', { className: 'muted' }, [baseBundleLabel]);
  const urlInput = el('input', {
    className: 'url-input',
    placeholder: 'https://penny-api-proxy.hesh.workers.dev/sms-patterns'
  });
  const fetchBtn = el('div', { className: 'formbtn' }, ['Fetch & use this instead']);
  const resetBtn = el('div', { className: 'formbtn ghost' }, ['Reset to bundled fallback']);

  fetchBtn.addEventListener('click', () => {
    void fetch(urlInput.value)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((json: unknown) => {
        const bundle = json as SmsPatternBundle;
        if (typeof bundle?.version !== 'number' || !Array.isArray(bundle?.banks))
          throw new Error('Not a valid pattern bundle');
        setBaseBundle(bundle, `Fetched from ${urlInput.value} (${bundle.banks.length} banks)`);
        status.textContent = baseBundleLabel;
        renderAll();
      })
      .catch((err: unknown) => {
        status.textContent = `Fetch failed: ${err instanceof Error ? err.message : String(err)} — still using ${baseBundleLabel}`;
      });
  });
  resetBtn.addEventListener('click', () => {
    setBaseBundle(SMS_PATTERNS_FALLBACK, 'Bundled fallback (offline, ships in the app)');
    status.textContent = baseBundleLabel;
    renderAll();
  });

  return el('div', { className: 'source-control' }, [
    el('div', {}, ['Pattern source: ', status]),
    el('div', { className: 'btn-row' }, [urlInput, fetchBtn, resetBtn])
  ]);
}

/** A draggable divider that resizes `target`'s width — `growsRight` controls whether dragging the mouse
 *  rightward grows or shrinks it (true for the left sidebar, false for the right panel, since the right
 *  panel is anchored to the window's right edge). Plain mouse events, not a library — this tool has no
 *  build-time dependency beyond esbuild transpiling its own TS. */
function makeResizeHandle(target: HTMLElement, opts: { min: number; max: number; growsRight: boolean }): HTMLElement {
  const handle = el('div', { className: 'resize-handle' });
  let startX = 0;
  let startWidth = 0;
  function onMouseMove(e: MouseEvent) {
    const delta = (e.clientX - startX) * (opts.growsRight ? 1 : -1);
    target.style.width = `${Math.min(opts.max, Math.max(opts.min, startWidth + delta))}px`;
  }
  function onMouseUp() {
    document.removeEventListener('mousemove', onMouseMove);
    document.removeEventListener('mouseup', onMouseUp);
  }
  handle.addEventListener('mousedown', (e) => {
    startX = e.clientX;
    startWidth = target.getBoundingClientRect().width;
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
    e.preventDefault();
  });
  return handle;
}

function mount() {
  const appRoot = document.getElementById('app');
  if (!appRoot) return;
  root = appRoot;
  root.append(renderSourceControl());
  const shell = el('div', { className: 'cc' });
  sideEl = el('div', { className: 'left' });
  midEl = el('div', { className: 'mid' });
  rightEl = el('div', { className: 'right' });
  const leftHandle = makeResizeHandle(sideEl, { min: 150, max: 420, growsRight: true });
  const rightHandle = makeResizeHandle(rightEl, { min: 220, max: 560, growsRight: false });
  shell.append(sideEl, leftHandle, midEl, rightHandle, rightEl);
  root.append(shell);
  modalRoot = el('div', { className: 'modal-root', style: { display: 'none' } });
  document.body.append(modalRoot);
  initToast();
  renderAll();
}

mount();
