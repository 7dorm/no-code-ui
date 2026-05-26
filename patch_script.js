const fs = require('fs');
const path = './src/features/editor/lib/block-editor-script.ts';
let code = fs.readFileSync(path, 'utf8');

code = code.replace(
  `          const getMovePatchKeys = (mode) => {
            if (mode === 'relative') {
              return { x: 'marginLeft', y: 'marginTop' };
            }
            return { x: 'left', y: 'top' };
          };`,
  `          const getMovePatchKeys = (mode) => {
            if (mode === 'relative') {
              return { x: 'left', y: 'top' };
            }
            return { x: 'left', y: 'top' };
          };`
);

code = code.replace(
  /const hasVisibleOffset = mode === 'relative' \|\| Math\.abs\(ml\) > 0\.5 \|\| Math\.abs\(mt\) > 0\.5;\n\s+if \(hasVisibleOffset\) {\n\s+const labelText = 'offset ml:' \+ Math\.round\(ml\) \+ ' mt:' \+ Math\.round\(mt\);\n\s+setShiftBadge\(labelText, rect\.left - ml, rect\.top - mt - 24\);\n\s+} else {/g,
  `const elLeft = mode === 'relative' ? (pxToNum(cs.left) || 0) : ml;
              const elTop = mode === 'relative' ? (pxToNum(cs.top) || 0) : mt;
              const hasVisibleOffset = mode === 'relative' || Math.abs(elLeft) > 0.5 || Math.abs(elTop) > 0.5;
              if (hasVisibleOffset) {
                const labelText = mode === 'relative' ? ('offset left:' + Math.round(elLeft) + ' top:' + Math.round(elTop)) : ('offset ml:' + Math.round(elLeft) + ' mt:' + Math.round(elTop));
                setShiftBadge(labelText, rect.left - ml, rect.top - mt - 24);
              } else {`
);

code = code.replace(
  /const futureMl = ml \+ dx;\n\s+const futureMt = mt \+ dy;\n\s+const parentInfo = getParentContentRect\(el\);/g,
  `const baseLeft = pxToNum(cs.left) || 0;
              const baseTop = pxToNum(cs.top) || 0;
              const futureLeft = baseLeft + dx;
              const futureTop = baseTop + dy;
              const parentInfo = getParentContentRect(el);`
);

code = code.replace(
  /const movedLeft = rect\.left - futureMl;\n\s+const movedTop = rect\.top - futureMt;\n\s+const movedRight = rect\.right \+ mr;\n\s+const movedBottom = rect\.bottom \+ mb;/g,
  `const movedLeft = rect.left + dx - ml;
              const movedTop = rect.top + dy - mt;
              const movedRight = rect.right + dx + mr;
              const movedBottom = rect.bottom + dy + mb;`
);

code = code.replace(
  /width: Math\.max\(0, rect\.width \+ futureMl \+ mr\),\n\s+height: Math\.max\(0, rect\.height \+ futureMt \+ mb\),/g,
  `width: Math.max(0, rect.width + ml + mr),
                height: Math.max(0, rect.height + mt + mb),`
);

code = code.replace(
  /setRect\(overlay\.content, {\n\s+left: rect\.left \+ bl \+ pl,\n\s+top: rect\.top \+ bt \+ pt,\n\s+width: Math\.max\(0, rect\.width - bl - br - pl - pr\),\n\s+height: Math\.max\(0, rect\.height - bt - bb - pt - pb\),\n\s+}\);/g,
  `setRect(overlay.content, {
                left: rect.left + dx + bl + pl,
                top: rect.top + dx + bt + pt,
                width: Math.max(0, rect.width - bl - br - pl - pr),
                height: Math.max(0, rect.height - bt - bb - pt - pb),
              });`
);

code = code.replace(
  /setRect\(overlay\.padding, {\n\s+left: rect\.left \+ bl,\n\s+top: rect\.top \+ bt,/g,
  `setRect(overlay.padding, {
                left: rect.left + dx + bl,
                top: rect.top + dy + bt,`
);

code = code.replace(
  /setShiftBadge\('offset ml:' \+ Math\.round\(futureMl\) \+ ' mt:' \+ Math\.round\(futureMt\), movedLeft, movedTop - 24\);/g,
  `setShiftBadge('offset left:' + Math.round(futureLeft) + ' top:' + Math.round(futureTop), movedLeft, movedTop - 24);`
);

code = code.replace(
  /if \(activeMoveMode === 'relative'\) {\n\s+const cs = window\.getComputedStyle\(selected\);\n\s+const baseLeft = pxToNum\(cs\.marginLeft\);\n\s+const baseTop = pxToNum\(cs\.marginTop\);/g,
  `if (activeMoveMode === 'relative') {
                const cs = window.getComputedStyle(selected);
                const baseLeft = pxToNum(cs.left) || 0;
                const baseTop = pxToNum(cs.top) || 0;`
);

code = code.replace(
  /if \(activeMoveMode === 'relative'\) {\n\s+const cs = window\.getComputedStyle\(el\);\n\s+const baseMl = toNum\(cs\.marginLeft\);\n\s+const baseMt = toNum\(cs\.marginTop\);\n\s+const deltaX = desiredLeft - rect\.left;\n\s+const deltaY = desiredTop - rect\.top;\n\s+const nextMl = snap\(baseMl \+ deltaX\);\n\s+const nextMt = snap\(baseMt \+ deltaY\);\n\s+const leftValue = formatMoveValue\(\n\s+nextMl,/g,
  `if (activeMoveMode === 'relative') {
              const cs = window.getComputedStyle(el);
              const baseLeft = pxToNum(cs.left) || 0;
              const baseTop = pxToNum(cs.top) || 0;
              const deltaX = desiredLeft - rect.left;
              const deltaY = desiredTop - rect.top;
              const nextLeft = snap(baseLeft + deltaX);
              const nextTop = snap(baseTop + deltaY);
              const leftValue = formatMoveValue(
                nextLeft,`
);

code = code.replace(
  /nextMt,\n\s+getMoveAxisReferenceSize\('relative', 'y', contentWidth, contentHeight\)/g,
  `nextTop,
                getMoveAxisReferenceSize('relative', 'y', contentWidth, contentHeight)`
);

fs.writeFileSync(path, code, 'utf8');
