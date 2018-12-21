// Copyright 2015 the V8 project authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import { PROF_COLS, UNICODE_BLOCK } from "../src/constants"
import { SelectionBroker } from "../src/selection-broker"
import { TextView } from "../src/text-view"
import { SourceResolver } from "./source-resolver";
import { MySelection } from "./selection";
import { anyToString } from "./util";
import { InstructionSelectionHandler } from "./selection-handler";

export class DisassemblyView extends TextView {
  SOURCE_POSITION_HEADER_REGEX: any;
  addr_event_counts: any;
  total_event_counts: any;
  max_event_counts: any;
  pos_lines: Array<any>;
  instructionSelectionHandler: InstructionSelectionHandler;
  offsetSelection: MySelection;

  createViewElement() {
    const pane = document.createElement('div');
    pane.setAttribute('id', "disassembly");
    pane.innerHTML =
      `<pre id='disassembly-text-pre' class='prettyprint prettyprinted'>
       <ul id='disassembly-list' class='nolinenums noindent'>
       </ul>
     </pre>`;

    return pane;
  }

  constructor(parentId, broker: SelectionBroker) {
    super(parentId, broker, null);
    let view = this;
    let ADDRESS_STYLE = {
      css: ['linkable-text', 'tag'],
      associateData: (text, fragment) => {
        const matches = text.match(/0?x?[0-9a-fA-F]{8,16}\s*(?<offset>[0-9a-f]+)/);
        const offset = Number.parseInt(matches.groups["offset"], 16);
        if (!Number.isNaN(offset)) {
          fragment.dataset.pcOffset = view.sourceResolver.getKeyPcOffset(offset);
        }
      }
    };
    let ADDRESS_LINK_STYLE = {
      css: 'tag'
    };
    let UNCLASSIFIED_STYLE = {
      css: 'com'
    };
    let NUMBER_STYLE = {
      css: 'lit'
    };
    let COMMENT_STYLE = {
      css: 'com'
    };
    let POSITION_STYLE = {
      css: 'com',
    };
    let OPCODE_STYLE = {
      css: 'kwd',
    };
    const BLOCK_HEADER_STYLE = {
      css: ['com', 'block'],
      associateData: function (text, fragment) {
        let matches = /\d+/.exec(text);
        if (!matches) return;
        const blockId = matches[0];
        fragment.dataset.blockId = blockId;
      }
    };
    const SOURCE_POSITION_HEADER_STYLE = {
      css: 'com'
    };
    view.SOURCE_POSITION_HEADER_REGEX = /^\s*--[^<]*<.*(not inlined|inlined\((\d+)\)):(\d+)>\s*--/;
    let patterns = [
      [
        [/^0?x?[0-9a-fA-F]{8,16}\s*[0-9a-f]+\ /, ADDRESS_STYLE, 1],
        [view.SOURCE_POSITION_HEADER_REGEX, SOURCE_POSITION_HEADER_STYLE, -1],
        [/^\s+-- B\d+ start.*/, BLOCK_HEADER_STYLE, -1],
        [/^.*/, UNCLASSIFIED_STYLE, -1]
      ],
      [
        [/^\s+[0-9a-f]+\s+/, NUMBER_STYLE, 2],
        [/^\s+[0-9a-f]+\s+[0-9a-f]+\s+/, NUMBER_STYLE, 2],
        [/^.*/, null, -1]
      ],
      [
        [/^\S+\s+/, OPCODE_STYLE, 3],
        [/^\S+$/, OPCODE_STYLE, -1],
        [/^.*/, null, -1]
      ],
      [
        [/^\s+/, null],
        [/^[^\(;]+$/, null, -1],
        [/^[^\(;]+/, null],
        [/^\(/, null, 4],
        [/^;/, COMMENT_STYLE, 5]
      ],
      [
        [/^0x[0-9a-f]{8,16}/, ADDRESS_LINK_STYLE],
        [/^[^\)]/, null],
        [/^\)$/, null, -1],
        [/^\)/, null, 3]
      ],
      [
        [/^; debug\: position /, COMMENT_STYLE, 6],
        [/^.+$/, COMMENT_STYLE, -1]
      ],
      [
        [/^\d+$/, POSITION_STYLE, -1],
      ]
    ];
    view.setPatterns(patterns);

    const linkHandler = (e) => {
      const offset = e.target.dataset.pcOffset;
      if (typeof offset != "undefined" && !Number.isNaN(offset)) {
        view.offsetSelection.select([offset], true);
        const [nodes, blockId] = view.sourceResolver.nodesForPCOffset(offset)
        if (nodes.length > 0) {
          e.stopPropagation();
          if (!e.shiftKey) {
            view.selectionHandler.clear();
          }
          view.selectionHandler.select(nodes, true);
        } else {
          view.updateSelection();
        }
      }
      return undefined;
    }
    view.divNode.addEventListener('click', linkHandler);

    const linkHandlerBlock = (e) => {
      const blockId = e.target.dataset.blockId;
      if (typeof blockId != "undefined" && !Number.isNaN(blockId)) {
        e.stopPropagation();
        if (!e.shiftKey) {
          view.selectionHandler.clear();
        }
        view.blockSelectionHandler.select([blockId], true);
      };
    }
    view.divNode.addEventListener('click', linkHandlerBlock);

    this.offsetSelection = new MySelection(anyToString);
    const instructionSelectionHandler = {
      clear: function () {
        view.offsetSelection.clear();
        view.updateSelection();
        broker.broadcastClear(instructionSelectionHandler);
      },
      select: function (instructionIds, selected) {
        view.offsetSelection.select(instructionIds, selected);
        view.updateSelection();
        broker.broadcastBlockSelect(instructionSelectionHandler, instructionIds, selected);
      },
      brokeredInstructionSelect: function (instructionIds, selected) {
        const firstSelect = view.offsetSelection.isEmpty();
        const keyPcOffsets = view.sourceResolver.instructionsToKeyPcOffsets(instructionIds);
        view.offsetSelection.select(keyPcOffsets, selected);
        view.updateSelection(firstSelect);
      },
      brokeredClear: function () {
        view.offsetSelection.clear();
        view.updateSelection();
      }
    };
    this.instructionSelectionHandler = instructionSelectionHandler;
    broker.addInstructionHandler(instructionSelectionHandler);
  }

  updateSelection(scrollIntoView: boolean = false) {
    super.updateSelection(scrollIntoView);
    let keyPcOffsets = this.sourceResolver.nodesToKeyPcOffsets(this.selection.selectedKeys());
    if (this.offsetSelection) {
      for (const key of this.offsetSelection.selectedKeys()) {
        keyPcOffsets.push(Number(key))
      }
    }
    for (const keyPcOffset of keyPcOffsets) {
      const elementsToSelect = this.divNode.querySelectorAll(`[data-pc-offset='${keyPcOffset}']`)
      for (const el of elementsToSelect) {
        el.classList.toggle("selected", true);
      }
    }
  }

  initializeCode(sourceText, sourcePosition) {
    let view = this;
    view.addr_event_counts = null;
    view.total_event_counts = null;
    view.max_event_counts = null;
    view.pos_lines = new Array();
    // Comment lines for line 0 include sourcePosition already, only need to
    // add sourcePosition for lines > 0.
    view.pos_lines[0] = sourcePosition;
    if (sourceText && sourceText != "") {
      let base = sourcePosition;
      let current = 0;
      let source_lines = sourceText.split("\n");
      for (let i = 1; i < source_lines.length; i++) {
        // Add 1 for newline character that is split off.
        current += source_lines[i - 1].length + 1;
        view.pos_lines[i] = base + current;
      }
    }
  }

  initializePerfProfile(eventCounts) {
    let view = this;
    if (eventCounts !== undefined) {
      view.addr_event_counts = eventCounts;

      view.total_event_counts = {};
      view.max_event_counts = {};
      for (let ev_name in view.addr_event_counts) {
        let keys = Object.keys(view.addr_event_counts[ev_name]);
        let values = keys.map(key => view.addr_event_counts[ev_name][key]);
        view.total_event_counts[ev_name] = values.reduce((a, b) => a + b);
        view.max_event_counts[ev_name] = values.reduce((a, b) => Math.max(a, b));
      }
    }
    else {
      view.addr_event_counts = null;
      view.total_event_counts = null;
      view.max_event_counts = null;
    }
  }

  // Shorten decimals and remove trailing zeroes for readability.
  humanize(num) {
    return num.toFixed(3).replace(/\.?0+$/, "") + "%";
  }

  // Interpolate between the given start and end values by a fraction of val/max.
  interpolate(val, max, start, end) {
    return start + (end - start) * (val / max);
  }

  processLine(line) {
    let view = this;
    let fragments = super.processLine(line);

    // Add profiling data per instruction if available.
    if (view.total_event_counts) {
      let matches = /^(0x[0-9a-fA-F]+)\s+\d+\s+[0-9a-fA-F]+/.exec(line);
      if (matches) {
        let newFragments = [];
        for (let event in view.addr_event_counts) {
          let count = view.addr_event_counts[event][matches[1]];
          let str = " ";
          let css_cls = "prof";
          if (count !== undefined) {
            let perc = count / view.total_event_counts[event] * 100;

            let col = { r: 255, g: 255, b: 255 };
            for (let i = 0; i < PROF_COLS.length; i++) {
              if (perc === PROF_COLS[i].perc) {
                col = PROF_COLS[i].col;
                break;
              }
              else if (perc > PROF_COLS[i].perc && perc < PROF_COLS[i + 1].perc) {
                let col1 = PROF_COLS[i].col;
                let col2 = PROF_COLS[i + 1].col;

                let val = perc - PROF_COLS[i].perc;
                let max = PROF_COLS[i + 1].perc - PROF_COLS[i].perc;

                col.r = Math.round(view.interpolate(val, max, col1.r, col2.r));
                col.g = Math.round(view.interpolate(val, max, col1.g, col2.g));
                col.b = Math.round(view.interpolate(val, max, col1.b, col2.b));
                break;
              }
            }

            str = UNICODE_BLOCK;

            let fragment = view.createFragment(str, css_cls);
            fragment.title = event + ": " + view.humanize(perc) + " (" + count + ")";
            fragment.style.color = "rgb(" + col.r + ", " + col.g + ", " + col.b + ")";

            newFragments.push(fragment);
          }
          else
            newFragments.push(view.createFragment(str, css_cls));

        }
        fragments = newFragments.concat(fragments);
      }
    }
    return fragments;
  }

  detachSelection() { return null; }
}