import { useLayoutEffect, useMemo } from 'react'
import {
  DndContext,
  type DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import type { Capsule } from '../lib/api'

function createEmptyCapsule(): Capsule {
  const id =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `cap-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
  return { id, text: '', sourceSnippet: '' }
}

/** 列表末尾始终保留一条空白胶囊，便于用户自行补充；删光后也会补回一条空的 */
function ensureTrailingBlank(capsules: Capsule[]): Capsule[] {
  if (capsules.length === 0) {
    return [createEmptyCapsule()]
  }
  const last = capsules[capsules.length - 1]
  if (last.text.trim() === '') {
    return capsules
  }
  return [...capsules, createEmptyCapsule()]
}

function SortableCapsule({
  capsule,
  onRemove,
  onUpdateText,
}: {
  capsule: Capsule
  onRemove: (id: string) => void
  onUpdateText: (id: string, text: string) => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: capsule.id,
  })
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  }
  const isBlank = capsule.text.trim() === ''
  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`flex touch-none items-center gap-2 rounded-2xl border px-3 py-2 ${
        isBlank
          ? 'border-dashed border-ta-border bg-ta-bg/80'
          : 'border-ta-border bg-ta-surface shadow-sm shadow-stone-200/40'
      } ${isDragging ? 'z-10 opacity-90 ring-2 ring-amber-400/60' : ''}`}
    >
      <button
        type="button"
        className="cursor-grab touch-manipulation rounded-lg px-1.5 py-2 text-stone-400 active:cursor-grabbing"
        aria-label="拖动排序"
        {...attributes}
        {...listeners}
      >
        ⋮⋮
      </button>
      <input
        type="text"
        value={capsule.text}
        onChange={(e) => onUpdateText(capsule.id, e.target.value)}
        placeholder="点击输入或补充一条…"
        maxLength={120}
        className="min-w-0 flex-1 border-0 bg-transparent p-0 text-left text-sm font-medium text-stone-800 outline-none ring-0 placeholder:text-stone-400 focus:ring-0"
        aria-label="胶囊文字"
      />
      <button
        type="button"
        onClick={() => onRemove(capsule.id)}
        className="shrink-0 rounded-lg px-2 py-1 text-xs text-rose-600 hover:bg-rose-50"
      >
        删除
      </button>
    </div>
  )
}

export function CapsuleBoard({
  capsules,
  onChange,
  topic,
}: {
  capsules: Capsule[]
  onChange: (next: Capsule[]) => void
  topic: string
}) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )
  const ids = useMemo(() => capsules.map((c) => c.id), [capsules])

  useLayoutEffect(() => {
    const next = ensureTrailingBlank(capsules)
    if (next !== capsules) {
      onChange(next)
    }
  }, [capsules, onChange])

  function onDragEnd(ev: DragEndEvent) {
    const { active, over } = ev
    if (!over || active.id === over.id) return
    const oldIndex = capsules.findIndex((c) => c.id === active.id)
    const newIndex = capsules.findIndex((c) => c.id === over.id)
    if (oldIndex < 0 || newIndex < 0) return
    onChange(ensureTrailingBlank(arrayMove(capsules, oldIndex, newIndex)))
  }

  function remove(id: string) {
    onChange(ensureTrailingBlank(capsules.filter((c) => c.id !== id)))
  }

  function updateText(id: string, text: string) {
    onChange(ensureTrailingBlank(capsules.map((c) => (c.id === id ? { ...c, text } : c))))
  }

  return (
    <section className="flex h-full min-h-0 flex-col rounded-2xl border border-ta-border bg-ta-surface p-4 shadow-sm shadow-stone-200/50">
      <h2 className="text-lg font-semibold text-stone-800">作文大纲</h2>
      <p className="mt-1 text-xs text-ta-ink-muted">
        题目：{topic}。点击文字直接改；拖动排序；末尾可补充新胶囊。这里不会生成整篇作文。
      </p>
      <div className="mt-4 min-h-0 flex-1 overflow-y-auto">
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
          <SortableContext items={ids} strategy={verticalListSortingStrategy}>
            <ul className="flex flex-col gap-2">
              {capsules.map((c, i) => (
                <li key={c.id} className="flex items-start gap-2">
                  <span className="mt-2 w-6 shrink-0 text-center text-xs tabular-nums text-stone-400">
                    {i + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <SortableCapsule capsule={c} onRemove={remove} onUpdateText={updateText} />
                    {c.sourceSnippet ? (
                      <p className="mt-1 line-clamp-2 pl-9 text-[11px] text-stone-400">
                        依据：「{c.sourceSnippet}」
                      </p>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          </SortableContext>
        </DndContext>
      </div>
      <p className="mt-4 border-t border-ta-border pt-3 text-xs text-ta-ink-muted">
        接下来在作文本上<strong className="text-stone-700">自己写正文</strong>——可以照着胶囊顺序一段段展开。
      </p>
    </section>
  )
}
