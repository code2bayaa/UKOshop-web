import { CKEditor } from '@ckeditor/ckeditor5-react'
import { Bold, ClassicEditor, Essentials, Heading, Italic, Link, List, Paragraph, Strikethrough, Table, TableToolbar, Underline, Undo } from 'ckeditor5'
import 'ckeditor5/ckeditor5.css'

/** "message" is the WhatsApp toolbar: only what WhatsApp itself can render (*bold*, _italic_, ~strike~, lists, links)
 *  — no headings, tables or underline, because they would be dropped on the way to the handset. */
const CONFIG = {
  full: {
    plugins: [Essentials, Paragraph, Heading, Bold, Italic, Underline, Link, List, Table, TableToolbar, Undo],
    toolbar: ['heading', '|', 'bold', 'italic', 'underline', '|', 'bulletedList', 'numberedList', 'link', 'insertTable', '|', 'undo', 'redo'],
  },
  message: {
    plugins: [Essentials, Paragraph, Bold, Italic, Strikethrough, Link, List, Undo],
    toolbar: ['bold', 'italic', 'strikethrough', '|', 'bulletedList', 'numberedList', 'link', '|', 'undo', 'redo'],
  },
}

export default function CKEditorImpl({ value, onChange, placeholder, variant = 'full' }: { value: string; onChange: (html: string) => void; placeholder?: string; variant?: keyof typeof CONFIG }) {
  return (
    <CKEditor
      editor={ClassicEditor}
      data={value}
      config={{
        licenseKey: 'GPL',
        ...CONFIG[variant],
        placeholder,
        table: { contentToolbar: ['tableColumn', 'tableRow'] },
      }}
      onChange={(_e, editor) => onChange(editor.getData())}
    />
  )
}
