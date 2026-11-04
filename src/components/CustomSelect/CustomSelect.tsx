import {
  useEffect,
  useLayoutEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from 'react';

import './CustomSelect.css';

export interface CustomSelectOption {
  icon?: ReactNode;
  label: string;
  value: string;
}

export interface CustomSelectProps {
  id?: string;
  labelId?: string;
  ariaLabel?: string;
  options: CustomSelectOption[];
  value: string;
  onChange: (value: string) => void;
}

export function CustomSelect({
  id,
  labelId,
  ariaLabel,
  options,
  value,
  onChange,
}: CustomSelectProps) {
  const fallbackId = useId();
  const triggerId = id ?? `ps-selectbox-${fallbackId}`;
  const listboxId = `${triggerId}-listbox`;
  const containerRef = useRef<HTMLDivElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(() =>
    Math.max(
      0,
      options.findIndex((option) => option.value === value),
    ),
  );

  const selectedOption = useMemo(
    () => options.find((option) => option.value === value) ?? options[0],
    [options, value],
  );

  useLayoutEffect(() => {
    if (!isOpen) return;
    const menu = menuRef.current;
    const trigger = containerRef.current?.querySelector('button');
    if (!menu || !trigger) return;
    menu.showPopover();
    function place() {
      if (!menu || !trigger) return;
      const bounds = trigger.getBoundingClientRect();
      const edge = 8;
      const gap = 3;
      const below = window.innerHeight - bounds.bottom - edge - gap;
      const above = bounds.top - edge - gap;
      const desired = Math.min(menu.scrollHeight, 280);
      const upwards = below < desired && above > below;
      const height = Math.min(desired, Math.max(0, upwards ? above : below));
      const width = Math.min(bounds.width, window.innerWidth - edge * 2);
      Object.assign(menu.style, {
        width: `${width}px`, maxHeight: `${height}px`,
        left: `${Math.max(edge, Math.min(bounds.left, window.innerWidth - width - edge))}px`,
        top: `${upwards ? bounds.top - gap - height : bounds.bottom + gap}px`,
      });
    }
    place();
    function handleScroll(event: Event) {
      if (!menu?.contains(event.target as Node)) place();
    }
    window.addEventListener('resize', place);
    document.addEventListener('scroll', handleScroll, true);
    return () => {
      window.removeEventListener('resize', place);
      document.removeEventListener('scroll', handleScroll, true);
      if (menu.matches(':popover-open')) menu.hidePopover();
    };
  }, [isOpen]);

  useEffect(() => {
    setActiveIndex(
      Math.max(
        0,
        options.findIndex((option) => option.value === value),
      ),
    );
  }, [options, value]);

  useEffect(() => {
    if (!isOpen) {
      return undefined;
    }

    const handlePointerDown = (event: PointerEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsOpen(false);
      }
    };

    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) {
      return undefined;
    }

    optionRefs.current[activeIndex]?.focus();
    return undefined;
  }, [activeIndex, isOpen]);

  function commitSelection(nextValue: string) {
    if (nextValue !== value) {
      onChange(nextValue);
    }

    setIsOpen(false);
    containerRef.current?.querySelector("button")?.focus();
  }

  function moveActiveIndex(direction: 1 | -1) {
    setActiveIndex((currentIndex) => {
      const nextIndex = currentIndex + direction;

      if (nextIndex < 0) {
        return options.length - 1;
      }

      if (nextIndex >= options.length) {
        return 0;
      }

      return nextIndex;
    });
  }

  function handleTriggerKeyDown(event: ReactKeyboardEvent<HTMLButtonElement>) {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveIndex(
        Math.max(
          0,
          options.findIndex((option) => option.value === value),
        ),
      );
      setIsOpen(true);
      return;
    }

    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      setIsOpen((current) => !current);
    }
  }

  function handleOptionKeyDown(
    event: ReactKeyboardEvent<HTMLButtonElement>,
    index: number,
  ) {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      moveActiveIndex(1);
      return;
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault();
      moveActiveIndex(-1);
      return;
    }

    if (event.key === 'Home') {
      event.preventDefault();
      setActiveIndex(0);
      return;
    }

    if (event.key === 'End') {
      event.preventDefault();
      setActiveIndex(options.length - 1);
      return;
    }

    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      commitSelection(options[index]?.value ?? value);
      return;
    }

    if (event.key === 'Tab') {
      setIsOpen(false);
    }
  }

  return (
    <div className={`ps-selectbox ${isOpen ? 'is-open' : ''}`} ref={containerRef}>
      <button
        aria-controls={listboxId}
        aria-expanded={isOpen}
        aria-haspopup="listbox"
        aria-label={ariaLabel}
        aria-labelledby={labelId}
        className="ps-selectbox__trigger"
        id={triggerId}
        onClick={() => setIsOpen((current) => !current)}
        onKeyDown={handleTriggerKeyDown}
        type="button"
      >
        <span className="ps-selectbox__value">{selectedOption?.icon}{selectedOption?.label}</span>
        <span className="ps-selectbox__icon" aria-hidden="true">
          <svg viewBox="0 0 20 20" focusable="false">
            <path d="M5.5 7.5 10 12l4.5-4.5" />
          </svg>
        </span>
      </button>

      {isOpen ? (
        <div
          ref={menuRef}
          popover="manual"
          aria-label={ariaLabel}
          aria-labelledby={labelId}
          className="ps-selectbox__menu"
          id={listboxId}
          role="listbox"
        >
          {options.map((option, index) => {
            const isSelected = option.value === value;

            return (
              <button
                aria-selected={isSelected}
                className={`ps-selectbox__option ${isSelected ? 'is-selected' : ''}`}
                key={option.value}
                onClick={() => commitSelection(option.value)}
                onKeyDown={(event) => handleOptionKeyDown(event, index)}
                ref={(node) => {
                  optionRefs.current[index] = node;
                }}
                role="option"
                tabIndex={activeIndex === index ? 0 : -1}
                type="button"
              >
                <span className="ps-selectbox__option-label">{option.icon}{option.label}</span>
                {isSelected ? (
                  <span className="ps-selectbox__check" aria-hidden="true">
                    <svg viewBox="0 0 20 20" focusable="false">
                      <path d="M4.5 10.5 8 14l7.5-8" />
                    </svg>
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}