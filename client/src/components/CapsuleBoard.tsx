import { useLayoutEffect, useMemo } from 'react'
import {
  DndContext,
  type DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
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

function DragHandle({
  attributes,
  listeners,
}: {
  attributes: ReturnType<typeof useSortable>['attributes']
  listeners: ReturnType<typeof useSortable>['listeners']
}) {
  return (
    <button
      type="button"
      className="-ml-1 flex min-h-11 min-w-11 shrink-0 cursor-grab touch-none items-center justify-center rounded-xl text-stone-400 active:cursor-grabbing active:bg-ta-muted"
      aria-label="拖动排序"
      {...attributes}
      {...listeners}
    >
      <span className="flex flex-col gap-[3px]" aria-hidden>
        <span className="block h-0.5 w-[18px] rounded-full bg-current opacity-70" />
        <span className="block h-0.5 w-[18px] rounded-full bg-current opacity-70" />
        <span className="block h-0.5 w-[18px] rounded-full bg-current opacity-70" />
      </span>
    </button>
  )
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
      className={`flex touch-pan-y items-center gap-1 rounded-2xl border px-2 py-1.5 sm:gap-2 sm:px-3 sm:py-2 ${
        isBlank
          ? 'border-2 border-dashed border-ta-border/90 bg-ta-muted/60'
          : 'border border-ta-green/30 border-l-[3px] border-l-ta-green bg-ta-surface shadow-sm shadow-stone-200/40'
      } ${isDragging ? 'z-10 opacity-90 ring-2 ring-ta-orange/50' : ''}`}
    >
      <DragHandle attributes={attributes} listeners={listeners} />
      <input
        type="text"
        value={capsule.text}
        onChange={(e) => onUpdateText(capsule.id, e.target.value)}
        placeholder={isBlank ? '点这里补充一条…' : '点击修改文字'}
        maxLength={120}
        className={`min-h-11 min-w-0 flex-1 touch-pan-y border-0 bg-transparent py-2 text-left text-base outline-none ring-0 focus:ring-0 sm:text-sm ${
          isBlank
            ? 'font-normal text-ta-ink-muted placeholder:text-ta-ink-muted/55'
            : 'font-medium text-stone-800 placeholder:text-stone-400'
        }`}
        aria-label="胶囊文字"
      />
      {!isBlank ? (
        <button
          type="button"
          onClick={() => onRemove(capsule.id)}
          className="flex min-h-11 min-w-11 shrink-0 touch-manipulation items-center justify-center rounded-xl text-sm text-rose-600 hover:bg-rose-50 active:bg-rose-100"
          aria-label="删除这条要点"
        >
          删除
        </button>
      ) : null}
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
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 6 } }),
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
    const cap = capsules.find((c) => c.id === id)
    if (cap?.text.trim() && !confirm('删掉这条大纲要点？')) return
    onChange(ensureTrailingBlank(capsules.filter((c) => c.id !== id)))
  }

  function updateText(id: string, text: string) {
    onChange(ensureTrailingBlank(capsules.map((c) => (c.id === id ? { ...c, text } : c))))
  }

  return (
    <section className="flex min-w-0 flex-col rounded-2xl border border-ta-border bg-ta-surface p-4 shadow-sm shadow-stone-200/50">
      <h2 className="text-lg font-semibold text-stone-800">作文大纲</h2>
      <p className="mt-1 break-words text-xs leading-relaxed text-ta-ink-muted">
        题目：{topic}。点击文字直接改；拖动排序；末尾可补充新胶囊。这里不会生成整篇作文。
      </p>
      <div className="mt-4 touch-pan-y">
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
          <SortableContext items={ids} strategy={verticalListSortingStrategy}>
            <ul className="flex flex-col gap-3 pb-1">
              {capsules.map((c, i) => {
                const isBlank = c.text.trim() === ''
                return (
                  <li key={c.id} className="flex touch-pan-y items-start gap-2">
                    <span
                      className={`mt-3 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold tabular-nums ${
                        isBlank
                          ? 'bg-ta-muted text-stone-400'
                          : 'bg-ta-green-soft text-ta-green'
                      }`}
                    >
                      {isBlank ? '+' : i + 1}
                    </span>
                    <div className="min-w-0 flex-1">
                      <SortableCapsule capsule={c} onRemove={remove} onUpdateText={updateText} />
                      {c.sourceSnippet ? (
                        <p className="mt-1.5 line-clamp-2 pl-1 text-[11px] leading-snug text-ta-ink-muted">
                          依据：「{c.sourceSnippet}」
                        </p>
                      ) : null}
                    </div>
                  </li>
                )
              })}
            </ul>
          </SortableContext>
        </DndContext>
      </div>
      <p className="mt-4 shrink-0 border-t border-ta-border pt-3 text-xs leading-relaxed break-words text-ta-ink-muted">
        接下来在作文本上<strong className="text-stone-700">自己写正文</strong>——可以照着胶囊顺序一段段展开。
      </p>
    </section>
  )
}
