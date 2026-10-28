import { useState } from 'react';
import type { Task } from '@shared/types';
import { DAY_NAMES_SHORT } from '@shared/types';
import { addDays, isoDate, isSameDay } from '@shared/date';
import TaskCard from './TaskCard';

interface Props {
  weekStart: Date;
  days: Task[][];
  onAddTask: (date: string) => void;
  onOpenTask: (task: Task) => void;
  onMoveTask: (id: string, date: string) => void;
  onChangeStatus: (task: Task) => void;
}

export default function WeekBoard({
  weekStart,
  days,
  onAddTask,
  onOpenTask,
  onMoveTask,
  onChangeStatus
}: Props) {
  const [dragOverDay, setDragOverDay] = useState<number | null>(null);
  const today = new Date();

  return (
    <main className="board">
      {days.map((dayTasks, index) => {
        const date = addDays(weekStart, index);
        const iso = isoDate(date);
        const isToday = isSameDay(date, today);

        return (
          <section
            key={iso}
            className={`day-col${isToday ? ' today' : ''}${dragOverDay === index ? ' drag-over' : ''}`}
            onDragOver={(e) => {
              e.preventDefault();
              e.dataTransfer.dropEffect = 'move';
              setDragOverDay(index);
            }}
            onDragLeave={(e) => {
              if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragOverDay(null);
            }}
            onDrop={(e) => {
              e.preventDefault();
              setDragOverDay(null);
              const id = e.dataTransfer.getData('text/task-id');
              if (id) onMoveTask(id, iso);
            }}
          >
            <header className="day-head">
              <span className="day-name">{DAY_NAMES_SHORT[index]}</span>
              <span className="day-count">{dayTasks.length}</span>
              <span className="day-date">
                {date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
              </span>
              <button
                className="day-add"
                onClick={() => onAddTask(iso)}
                title={`Add task on ${DAY_NAMES_SHORT[index]}`}
              >
                +
              </button>
            </header>

            <div className="day-body">
              {dayTasks.length === 0 ? (
                <div className="day-empty">Drop or add tasks</div>
              ) : (
                dayTasks.map((task) => (
                  <TaskCard
                    key={task.id}
                    task={task}
                    onOpen={onOpenTask}
                    onChangeStatus={onChangeStatus}
                  />
                ))
              )}
            </div>
          </section>
        );
      })}
    </main>
  );
}
