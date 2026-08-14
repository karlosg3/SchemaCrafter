import React, { useState, useMemo, useEffect, useRef } from 'react';
import { Copy, Check, Download, Code2, Database, Sparkles, RefreshCw } from 'lucide-react';
import confetti from 'canvas-confetti';
import Prism from 'prismjs';
import 'prismjs/components/prism-typescript';
import 'prismjs/components/prism-sql';
import type { DatabaseProject, ORMTarget, DatabaseEngine } from '../../types/schema';
import { generateCodeForTarget } from '../../utils/generators';
import { parseCodeToProject } from '../../utils/parsers';

// Register Prisma grammar in PrismJS if not present
if (!Prism.languages.prisma) {
  Prism.languages.prisma = {
    'comment': /\/\/.*|\/\*[\s\S]*?\*\//,
    'keyword': /\b(model|datasource|generator|enum|type)\b/,
    'attribute': /@[a-zA-Z0-9._()]+/,
    'type-name': /\b(String|Int|BigInt|Float|Decimal|Boolean|DateTime|Json|Bytes)\b/,
    'punctuation': /[{}(),:]/,
    'string': /(["'])(?:\\(?:\r\n|[\s\S])|(?!\1)[^\\\r\n])*\1/,
    'number': /\b\d+\b/
  };
}

interface CodePreviewPanelProps {
  project: DatabaseProject;
  onEngineChange: (engine: DatabaseEngine) => void;
  onCodeProjectSync: (updatedProject: DatabaseProject) => void;
  onStartResize?: (e: React.MouseEvent) => void;
}

export const CodePreviewPanel: React.FC<CodePreviewPanelProps> = ({
  project,
  onEngineChange,
  onCodeProjectSync,
  onStartResize
}) => {
  const [activeTarget, setActiveTarget] = useState<ORMTarget>('prisma');
  const [copied, setCopied] = useState(false);
  const [editableCode, setEditableCode] = useState('');
  const [syncStatus, setSyncStatus] = useState<'synced' | 'editing'>('synced');

  const isUserTypingRef = useRef(false);

  // Generated code from visual project model
  const generatedCode = useMemo(() => {
    return generateCodeForTarget(project, activeTarget);
  }, [project, activeTarget]);

  // Keep editable code synced ONLY when visual model changes via UI canvas (not user typing)
  useEffect(() => {
    if (!isUserTypingRef.current) {
      setEditableCode(generatedCode);
    }
  }, [generatedCode]);

  // Debounced reverse parser: User code -> Canvas Model
  const debounceTimerRef = useRef<any>(null);

  const handleUserCodeChange = (text: string) => {
    isUserTypingRef.current = true;
    setEditableCode(text);
    setSyncStatus('editing');

    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    debounceTimerRef.current = setTimeout(() => {
      try {
        const parsedProject = parseCodeToProject(text, activeTarget, project);
        onCodeProjectSync(parsedProject);
        setSyncStatus('synced');
      } catch (err) {
        console.error('Parse error:', err);
      } finally {
        setTimeout(() => {
          isUserTypingRef.current = false;
        }, 1000);
      }
    }, 400);
  };

  // Syntax highlighting via PrismJS for preview & editing overlay
  const highlightedHtml = useMemo(() => {
    let lang = 'typescript';
    if (activeTarget === 'sql') lang = 'sql';
    if (activeTarget === 'prisma') lang = 'prisma';

    const grammar = Prism.languages[lang] || Prism.languages.typescript;
    const textToHighlight = editableCode + (editableCode.endsWith('\n') ? ' ' : '');
    return Prism.highlight(textToHighlight, grammar, lang);
  }, [editableCode, activeTarget]);

  const handleCopy = () => {
    navigator.clipboard.writeText(editableCode);
    setCopied(true);
    confetti({ particleCount: 35, spread: 60, origin: { y: 0.8 } });
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = () => {
    const extensions: Record<ORMTarget, string> = {
      prisma: 'schema.prisma',
      drizzle: 'schema.ts',
      mikroorm: 'entities.ts',
      typeorm: 'entities.ts',
      sql: 'schema.sql'
    };
    const filename = extensions[activeTarget];
    const blob = new Blob([editableCode], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
  };

  const targets: { id: ORMTarget; label: string; badge: string; color: string }[] = [
    { id: 'prisma', label: 'Prisma', badge: '.prisma', color: 'from-cyan-500 to-blue-600' },
    { id: 'drizzle', label: 'Drizzle ORM', badge: '.ts', color: 'from-emerald-400 to-teal-600' },
    { id: 'mikroorm', label: 'MikroORM', badge: '.ts', color: 'from-indigo-500 to-purple-600' },
    { id: 'typeorm', label: 'TypeORM', badge: '.ts', color: 'from-rose-500 to-pink-600' },
    { id: 'sql', label: 'Raw SQL', badge: '.sql', color: 'from-amber-400 to-orange-600' }
  ];

  // Calculate total height needed so parent container handles scrolling 100%
  const lineCount = useMemo(() => editableCode.split('\n').length, [editableCode]);
  const minContentHeight = Math.max(300, lineCount * 20 + 40);

  return (
    <div className="w-full h-full flex flex-col bg-slate-900 border-l border-slate-800 text-slate-200 select-none relative group/code">
      {/* Resizable Width Drag Handle on Left Edge */}
      {onStartResize && (
        <div
          onMouseDown={onStartResize}
          title="Drag to resize code panel width"
          className="absolute left-0 top-0 bottom-0 w-1.5 cursor-col-resize hover:bg-indigo-500/50 active:bg-indigo-500 transition-colors z-30 flex items-center justify-center group-hover/code:bg-slate-700/50"
        />
      )}

      {/* Header & Tabs */}
      <div className="p-3 border-b border-slate-800 bg-slate-950 flex flex-col gap-3 flex-shrink-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Code2 className="text-indigo-400" size={18} />
            <h2 className="font-semibold text-sm text-slate-100 tracking-wide">
              Live Highlighted Code Editor
            </h2>
          </div>

          {/* Engine Selector */}
          <div className="flex items-center gap-1.5">
            <Database size={13} className="text-slate-400" />
            <select
              value={project.engine}
              onChange={(e) => onEngineChange(e.target.value as DatabaseEngine)}
              className="bg-slate-900 border border-slate-700 text-xs text-slate-200 rounded-lg px-2 py-1 outline-none focus:border-indigo-500 font-mono"
            >
              <option value="postgresql">PostgreSQL</option>
              <option value="mysql">MySQL</option>
              <option value="sqlite">SQLite</option>
            </select>
          </div>
        </div>

        {/* ORM Target Tabs */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 custom-scrollbar">
            {targets.map((t) => (
              <button
                key={t.id}
                onClick={() => {
                  isUserTypingRef.current = false;
                  setActiveTarget(t.id);
                  setEditableCode(generateCodeForTarget(project, t.id));
                }}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all whitespace-nowrap ${
                  activeTarget === t.id
                    ? `bg-gradient-to-r ${t.color} text-white shadow-md font-semibold scale-105`
                    : 'bg-slate-850 hover:bg-slate-800 text-slate-400 hover:text-slate-200 border border-slate-800'
                }`}
              >
                {t.label}
                <span className="text-[10px] opacity-75 font-mono">({t.badge})</span>
              </button>
            ))}
          </div>

          {/* Sync Status Badge */}
          <span
            className={`flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full font-mono font-medium border ${
              syncStatus === 'synced'
                ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
                : 'bg-amber-500/20 text-amber-300 border-amber-500/30'
            }`}
          >
            {syncStatus === 'synced' ? <Sparkles size={11} /> : <RefreshCw size={11} className="animate-spin" />}
            {syncStatus === 'synced' ? 'Canvas Synced' : 'Syncing...'}
          </span>
        </div>
      </div>

      {/* Editor Main Container */}
      <div className="flex-1 relative overflow-hidden bg-slate-950 flex flex-col">
        {/* Floating Action Controls */}
        <div className="absolute top-3 right-4 z-20 flex items-center gap-2">
          <button
            onClick={handleCopy}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800/90 hover:bg-indigo-600 text-slate-200 hover:text-white text-xs font-medium border border-slate-700/80 shadow-lg backdrop-blur transition-all"
          >
            {copied ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} />}
            {copied ? 'Copied!' : 'Copy Code'}
          </button>
          <button
            onClick={handleDownload}
            title="Download Code File"
            className="p-1.5 rounded-lg bg-slate-800/90 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700/80 shadow-lg backdrop-blur transition-all"
          >
            <Download size={14} />
          </button>
        </div>

        {/* SINGLE PARENT SCROLL CONTAINER (Scrolls BOTH layers together seamlessly) */}
        <div className="flex-1 w-full h-full overflow-auto custom-scrollbar relative bg-slate-950">
          <div
            className="relative w-full"
            style={{ minHeight: `${minContentHeight}px` }}
          >
            {/* Highlighted Prism Display Layer */}
            <pre
              className="code-editor-overlay absolute inset-0 pointer-events-none overflow-hidden"
              aria-hidden="true"
            >
              <code
                className={`language-${activeTarget === 'sql' ? 'sql' : activeTarget === 'prisma' ? 'prisma' : 'typescript'}`}
                dangerouslySetInnerHTML={{ __html: highlightedHtml }}
              />
            </pre>

            {/* Editable Transparent Textarea Layer */}
            <textarea
              value={editableCode}
              onChange={(e) => handleUserCodeChange(e.target.value)}
              className="code-editor-overlay absolute inset-0 text-transparent caret-indigo-400 bg-transparent resize-none overflow-hidden outline-none selection:bg-indigo-500/30 selection:text-white"
              placeholder="Type or modify ORM / SQL code here..."
              spellCheck={false}
            />
          </div>
        </div>

        {/* Footer info */}
        <div className="px-4 py-2 bg-slate-900/80 border-t border-slate-800/80 flex items-center justify-between text-[11px] text-slate-400 flex-shrink-0">
          <span>Target: <strong className="text-indigo-300 capitalize">{activeTarget}</strong></span>
          <span>{lineCount} lines</span>
        </div>
      </div>
    </div>
  );
};
