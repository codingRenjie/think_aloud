import { useLayoutEffect, useMemo } from 'react'
import {
  DndContext,
  type DragEndEvent,
  KeyboardSensor,
  type Modifier,
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

/** 拖拽排序时禁止横向位移，避免 iOS 页面被撑宽或卡住 */
const restrictToVerticalAxis: Modifier = ({ transform }) => ({
  ...transform,
  x: 0,
})

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
  light,
}: {
  attributes: ReturnType<typeof useSortable>['attributes']
  listeners: ReturnType<typeof useSortable>['listeners']
  light?: boolean
}) {
  return (
    <button
      type="button"
      className={`flex h-9 w-9 shrink-0 cursor-grab touch-none items-center justify-center rounded-full active:cursor-grabbing ${
        light
          ? 'text-white/90 active:bg-white/15'
          : 'text-ta-orange/70 active:bg-ta-orange/10'
      }`}
      aria-label="拖动排序"
      {...attributes}
      {...listeners}
    >
      <span className="flex flex-col gap-[2.5px]" aria-hidden>
        <span className="block h-0.5 w-3.5 rounded-full bg-current opacity-80" />
        <span className="block h-0.5 w-3.5 rounded-full bg-current opacity-80" />
        <span className="block h-0.5 w-3.5 rounded-full bg-current opacity-80" />
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
      className={`flex h-10 touch-pan-y items-center gap-0.5 rounded-full pl-0.5 pr-1 sm:h-11 sm:pr-1.5 ${
        isBlank
          ? 'border border-dashed border-ta-orange/45 bg-ta-orange-pale'
          : 'bg-ta-orange shadow-md shadow-ta-orange/25'
      } ${isDragging ? 'z-10 opacity-95 ring-2 ring-white/60' : ''}`}
    >
      <DragHandle attributes={attributes} listeners={listeners} light={!isBlank} />
      <input
        type="text"
        value={capsule.text}
        onChange={(e) => onUpdateText(capsule.id, e.target.value)}
        placeholder={isBlank ? '点这里补充一条…' : '点击修改文字'}
        maxLength={120}
        className={`min-w-0 flex-1 touch-pan-y border-0 bg-transparent py-0 text-left text-base outline-none ring-0 focus:ring-0 ${
          isBlank
            ? 'font-normal text-ta-ink-muted placeholder:text-ta-ink-muted/50'
            : 'font-medium text-white placeholder:text-white/55'
        }`}
        aria-label="胶囊文字"
      />
      {!isBlank ? (
        <button
          type="button"
          onClick={() => onRemove(capsule.id)}
          className="flex h-8 w-8 shrink-0 touch-manipulation items-center justify-center rounded-full text-lg leading-none text-white/85 active:bg-white/15"
          aria-label="删除这条要点"
        >
          ×
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
    <section className="flex w-full min-w-0 max-w-full flex-col overflow-hidden rounded-2xl border border-ta-border bg-ta-surface shadow-sm shadow-stone-200/50">
      {/* 引导区：参考 Duolingo Feed 的「画面 + 说明」 */}
      <div className="overflow-hidden bg-white">
        <img
          src="/playground.png"
          alt="整理大纲的小帮手"
          className="block h-auto max-w-full w-full bg-white"
        />
      </div>
      <div className="space-y-1.5 border-b border-ta-border px-4 py-4">
        <h2 className="text-xl font-bold leading-tight text-ta-green sm:text-[1.375rem]">作文大纲</h2>
        <p className="text-base font-semibold leading-snug text-ta-ink">作文题：{topic}</p>
        <p className="text-sm leading-relaxed text-ta-ink-muted">
          咱们已经有不错的素材，现在拖动下面的胶囊调整顺序就可以完成作文大纲啦！
        </p>
      </div>

      <div className="touch-pan-y p-4 pt-5">
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          modifiers={[restrictToVerticalAxis]}
          onDragEnd={onDragEnd}
        >
          <SortableContext items={ids} strategy={verticalListSortingStrategy}>
            <ul className="flex flex-col gap-4 pb-1">
              {capsules.map((c, i) => {
                const isBlank = c.text.trim() === ''
                const filledIndex = capsules
                  .slice(0, i + 1)
                  .filter((item) => item.text.trim() !== '').length
                return (
                  <li key={c.id} className="touch-pan-y">
                    <div className="flex items-center gap-2.5">
                      <span
                        className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold tabular-nums ${
                          isBlank
                            ? 'bg-ta-muted text-stone-400'
                            : 'bg-ta-orange-soft text-ta-orange'
                        }`}
                      >
                        {isBlank ? '+' : filledIndex}
                      </span>
                      <div className="min-w-0 flex-1">
                        <SortableCapsule capsule={c} onRemove={remove} onUpdateText={updateText} />
                      </div>
                    </div>
                    {c.sourceSnippet ? (
                      <p className="mt-1.5 pl-9 text-[11px] leading-snug text-ta-ink-muted">
                        依据：「{c.sourceSnippet}」
                      </p>
                    ) : null}
                  </li>
                )
              })}
            </ul>
          </SortableContext>
        </DndContext>
      </div>
      <p className="mx-4 mb-4 shrink-0 border-t border-ta-border pt-3 text-xs leading-relaxed break-words text-ta-ink-muted">
        接下来在作文本上<strong className="text-stone-700">自己写正文</strong>——可以照着胶囊顺序一段段展开。
      </p>
    </section>
  )
}
