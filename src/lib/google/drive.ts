import { google } from 'googleapis'
import type { OAuth2Client } from 'google-auth-library'

const EMPTY_IPYNB = JSON.stringify({
  cells: [{ cell_type: 'code', execution_count: null, metadata: {}, outputs: [], source: [] }],
  metadata: {
    kernelspec: { display_name: 'Python 3', language: 'python', name: 'python3' },
    language_info: { name: 'python', version: '3.8.0' },
  },
  nbformat: 4,
  nbformat_minor: 4,
})

async function createFolder(drive: ReturnType<typeof google.drive>, name: string, parentId: string) {
  const res = await drive.files.create({
    requestBody: { name, mimeType: 'application/vnd.google-apps.folder', parents: [parentId] },
    fields: 'id',
  })
  return res.data.id!
}

async function createShortcut(drive: ReturnType<typeof google.drive>, targetId: string, parentId: string, name: string) {
  await drive.files.create({
    requestBody: {
      name,
      mimeType: 'application/vnd.google-apps.shortcut',
      parents: [parentId],
      shortcutDetails: { targetId },
    },
  })
}

async function uploadIpynb(drive: ReturnType<typeof google.drive>, name: string, parentId: string) {
  const { Readable } = await import('stream')
  await drive.files.create({
    requestBody: { name: `${name}.ipynb`, parents: [parentId] },
    media: { mimeType: 'application/x-ipynb+json', body: Readable.from([EMPTY_IPYNB]) },
  })
}

async function createBlankDoc(drive: ReturnType<typeof google.drive>, name: string, parentId: string) {
  await drive.files.create({
    requestBody: {
      name,
      mimeType: 'application/vnd.google-apps.document',
      parents: [parentId],
    },
  })
}

export async function createStudentDriveFolder(auth: OAuth2Client, studentName: string): Promise<string> {
  const drive = google.drive({ version: 'v3', auth })
  const studentsFolderId = process.env.GOOGLE_STUDENTS_FOLDER_ID!
  const lecTopic1FileId = process.env.GOOGLE_LEC_TOPIC1_FILE_ID!

  // Root student folder
  const rootId = await createFolder(drive, studentName, studentsFolderId)
  await drive.permissions.create({
    fileId: rootId,
    requestBody: { role: 'reader', type: 'anyone' },
  })

  // 1. Teaching Slides — shortcut to Topic_1.pptx
  const teachingId = await createFolder(drive, '1. Teaching Slides', rootId)
  await createShortcut(drive, lecTopic1FileId, teachingId, 'Topic_1.pptx')

  // 2. In-Class Coding Examples — empty ipynb
  const codingId = await createFolder(drive, '2. In-Class Coding Examples', rootId)
  await uploadIpynb(drive, `${studentName} Topic 1`, codingId)

  // 3. Homework Questions — blank Google Doc
  const hwQId = await createFolder(drive, '3. Homework Questions', rootId)
  await createBlankDoc(drive, `${studentName} Topic 1 Homework`, hwQId)

  // 4. Homework Sample Answers — empty ipynb
  const hwAnsId = await createFolder(drive, '4. Homework Sample Answers', rootId)
  await uploadIpynb(drive, `${studentName} Homework Topic 1`, hwAnsId)

  return `https://drive.google.com/drive/folders/${rootId}`
}
