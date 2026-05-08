import { ArrowUp, ArrowDown, Trash2, GripVertical } from "lucide-react";
import { useRef, useState } from "react";

export default function Timeline({ routeStops = [], setRouteStops }) {

  const dragIndexRef = useRef(null);
  const [isDragging, setIsDragging] = useState(false);

  /* ================= DRAG ================= */

  const onDragStart = (index) => {
    dragIndexRef.current = index;
    setIsDragging(true);
  };

  const onDrop = (index) => {
    const dragIndex = dragIndexRef.current;
    if (dragIndex === null || dragIndex === index) return;

    const arr = [...routeStops];
    const moved = arr.splice(dragIndex, 1)[0];
    arr.splice(index, 0, moved);

    setRouteStops(arr);
    dragIndexRef.current = null;
    setIsDragging(false);
  };

  const onDragEnd = () => {
    dragIndexRef.current = null;
    setIsDragging(false);
  };

  /* ================= MOVE UP/DOWN ================= */

  const moveUp = (index) => {
    if (index === 0) return;
    const arr = [...routeStops];
    [arr[index - 1], arr[index]] = [arr[index], arr[index - 1]];
    setRouteStops(arr);
  };

  const moveDown = (index) => {
    if (index === routeStops.length - 1) return;
    const arr = [...routeStops];
    [arr[index], arr[index + 1]] = [arr[index + 1], arr[index]];
    setRouteStops(arr);
  };

  /* ================= REMOVE ================= */

  const removeStop = (index) => {
    const arr = [...routeStops];
    arr.splice(index, 1);
    setRouteStops(arr);
  };

  /* ================= EMPTY ================= */

  if (!routeStops.length) {
    return (
      <p className="text-slate-500 text-sm mt-6">
        No stops added yet
      </p>
    );
  }

  /* ================= UI ================= */

  return (
    <div className="relative mt-2">

      {/* vertical line */}
      <div className="absolute left-4 top-0 bottom-0 w-px bg-slate-300" />

      {routeStops.map((stop, i) => (
        <div
          key={stop.id}
          draggable
          onDragStart={() => onDragStart(i)}
          onDragOver={(e) => e.preventDefault()}
          onDrop={() => onDrop(i)}
          onDragEnd={onDragEnd}
          className={`relative flex items-center gap-4 mb-3 ${
            isDragging ? "cursor-grabbing" : "cursor-move"
          }`}
        >
          {/* dot */}
          <div className="z-10 w-3 h-3 rounded-full bg-blue-600 shadow-sm" />

          {/* card */}
          <div className="flex-1 bg-white border border-slate-200 p-3 rounded-lg flex items-center justify-between shadow-xs">

            <div className="flex items-center gap-2">
              <GripVertical size={16} className="text-slate-500" />
              <span className="font-medium">
                {i + 1}. {stop.stop_name}
              </span>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => moveUp(i)}
                disabled={i === 0}
                className="disabled:opacity-40"
                aria-label="Move stop up"
                title="Move up"
              >
                <ArrowUp size={16} />
              </button>

              <button
                type="button"
                onClick={() => moveDown(i)}
                disabled={i === routeStops.length - 1}
                className="disabled:opacity-40"
                aria-label="Move stop down"
                title="Move down"
              >
                <ArrowDown size={16} />
              </button>

              <button
                type="button"
                onClick={() => removeStop(i)}
                className="text-red-600"
                aria-label="Remove stop"
                title="Remove"
              >
                <Trash2 size={16} />
              </button>
            </div>

          </div>
        </div>
      ))}
    </div>
  );
}
