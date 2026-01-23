import { Node, mergeAttributes } from '@tiptap/core';

export interface CheckboxOptions {
  HTMLAttributes: Record<string, any>;
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    checkbox: {
      toggleCheckbox: () => ReturnType;
      insertCheckbox: () => ReturnType;
    };
  }
}

export const Checkbox = Node.create<CheckboxOptions>({
  name: 'checkbox',
  
  group: 'block',
  
  content: 'inline*',
  
  parseHTML() {
    return [
      {
        tag: 'div[data-type="checkbox"]',
      },
    ];
  },
  
  renderHTML({ node, HTMLAttributes }) {
    const checked = node.attrs.checked || false;
    
    return [
      'div',
      mergeAttributes(this.options.HTMLAttributes, HTMLAttributes, {
        'data-type': 'checkbox',
        'data-checked': checked,
        class: `note-checkbox ${checked ? 'checked' : ''}`,
      }),
      [
        'span',
        {
          class: 'note-checkbox-icon',
          contenteditable: 'false',
          'data-checkbox-icon': 'true',
          tabindex: '-1',
        },
      ],
      [
        'span',
        {
          class: checked ? 'note-checkbox-content checked' : 'note-checkbox-content',
        },
        0,
      ],
    ];
  },
  
  addAttributes() {
    return {
      checked: {
        default: false,
        parseHTML: element => element.getAttribute('data-checked') === 'true',
        renderHTML: attributes => {
          if (!attributes.checked) {
            return {};
          }
          return {
            'data-checked': attributes.checked,
          };
        },
      },
    };
  },
  
  addCommands() {
    return {
      toggleCheckbox: () => ({ tr, state, dispatch }) => {
        if (dispatch) {
          // Ищем чекбокс начиная с текущей позиции
          const { selection } = state;
          const { $from } = selection;
          
          let checkboxPos: number | undefined = undefined;
          
          for (let i = $from.depth; i >= 0; i--) {
            const node = $from.node(i);
            if (node.type.name === 'checkbox') {
              checkboxPos = $from.before(i);
              break;
            }
          }
          
          if (checkboxPos !== undefined) {
            const node = tr.doc.nodeAt(checkboxPos);
            if (node && node.type.name === 'checkbox') {
              const checked = !node.attrs.checked;
              tr.setNodeMarkup(checkboxPos, undefined, { checked });
              return true;
            }
          }
        }
        return false;
      },
      
      insertCheckbox: () => ({ commands }) => {
        return commands.insertContent({
          type: this.name,
          attrs: { checked: false },
          content: [{ type: 'text', text: ' ' }],
        });
      },
    };
  },
  
  addKeyboardShortcuts() {
    return {
      Enter: ({ editor }) => {
        const { selection } = editor.state;
        const { $from } = selection;
        
        // Проверяем, находимся ли мы внутри чекбокса
        let checkboxNode = null;
        let checkboxPos = -1;
        
        for (let i = $from.depth; i >= 0; i--) {
          const node = $from.node(i);
          if (node.type.name === 'checkbox') {
            checkboxNode = node;
            checkboxPos = $from.before(i);
            break;
          }
        }
        
        if (checkboxNode) {
          // Получаем текст внутри чекбокса (без учета пробелов)
          const checkboxContent = checkboxNode.textContent.trim();
          
          // Если чекбокс пустой (только пробелы или вообще пусто), удаляем его и создаем обычный параграф
          if (!checkboxContent) {
            const tr = editor.state.tr;
            // Вставляем параграф на месте чекбокса
            tr.replaceWith(checkboxPos, checkboxPos + checkboxNode.nodeSize, editor.schema.nodes.paragraph.create());
            editor.view.dispatch(tr);
            // Перемещаем курсор в новый параграф
            setTimeout(() => {
              editor.commands.setTextSelection(checkboxPos);
            }, 0);
            return true;
          }
          
          // Если чекбокс не пустой, создаем новый пустой чекбокс
          editor.commands.insertContent({
            type: this.name,
            attrs: { checked: false },
            content: [{ type: 'text', text: ' ' }],
          });
          return true;
        }
        
        return false;
      },
    };
  },
});
