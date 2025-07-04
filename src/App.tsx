import { useState, useEffect } from 'react'
import { blink } from './blink/client'
import { initializeDatabase } from './db/init'
import { Button } from './components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './components/ui/card'
import { Textarea } from './components/ui/textarea'
import { Input } from './components/ui/input'
import { Separator } from './components/ui/separator'
import { Badge } from './components/ui/badge'
import { ScrollArea } from './components/ui/scroll-area'
import { Alert, AlertDescription } from './components/ui/alert'
import { 
  Mic, 
  MicOff, 
  Play, 
  Pause, 
  Save, 
  Trash2, 
  PlusCircle, 
  FileText,
  Clock,
  Volume2
} from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import toast from 'react-hot-toast'

interface Note {
  id: string
  title: string
  content: string
  created_at: string
  updated_at: string
  user_id: string
  duration?: number
  audio_url?: string
}

function App() {
  const [notes, setNotes] = useState<Note[]>([])
  const [currentNote, setCurrentNote] = useState<Note | null>(null)
  const [isRecording, setIsRecording] = useState(false)
  const [isPaused, setIsPaused] = useState(false)
  const [isTranscribing, setIsTranscribing] = useState(false)
  const [recordingTime, setRecordingTime] = useState(0)
  const [mediaRecorder, setMediaRecorder] = useState<MediaRecorder | null>(null)
  const [audioChunks, setAudioChunks] = useState<Blob[]>([])
  const [user, setUser] = useState<{ id: string; email: string } | null>(null)
  const [newNoteTitle, setNewNoteTitle] = useState('')

  useEffect(() => {
    // Initialize database and get user and load notes
    const loadUserAndNotes = async () => {
      try {
        await initializeDatabase()
        const currentUser = await blink.auth.me()
        setUser(currentUser)
        await loadNotes()
      } catch (error) {
        console.error('Error loading user:', error)
      }
    }
    
    loadUserAndNotes()
  }, [])

  useEffect(() => {
    let interval: NodeJS.Timeout
    if (isRecording && !isPaused) {
      interval = setInterval(() => {
        setRecordingTime(prev => prev + 1)
      }, 1000)
    }
    return () => clearInterval(interval)
  }, [isRecording, isPaused])

  const loadNotes = async () => {
    try {
      const notesData = await blink.db.notes.list({
        orderBy: { updated_at: 'desc' }
      })
      setNotes(notesData)
    } catch (error) {
      console.error('Error loading notes:', error)
    }
  }

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const recorder = new MediaRecorder(stream)
      
      setMediaRecorder(recorder)
      setAudioChunks([])
      setRecordingTime(0)
      setIsRecording(true)
      setIsPaused(false)

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          setAudioChunks(prev => [...prev, event.data])
        }
      }

      recorder.onstop = async () => {
        stream.getTracks().forEach(track => track.stop())
        await processRecording()
      }

      recorder.start()
      toast.success('Recording started!')
    } catch (error) {
      console.error('Error starting recording:', error)
      toast.error('Could not start recording. Please check microphone permissions.')
    }
  }

  const pauseRecording = () => {
    if (mediaRecorder && mediaRecorder.state === 'recording') {
      mediaRecorder.pause()
      setIsPaused(true)
      toast.success('Recording paused')
    }
  }

  const resumeRecording = () => {
    if (mediaRecorder && mediaRecorder.state === 'paused') {
      mediaRecorder.resume()
      setIsPaused(false)
      toast.success('Recording resumed')
    }
  }

  const stopRecording = () => {
    if (mediaRecorder && (mediaRecorder.state === 'recording' || mediaRecorder.state === 'paused')) {
      mediaRecorder.stop()
      setIsRecording(false)
      setIsPaused(false)
    }
  }

  const processRecording = async () => {
    if (audioChunks.length === 0) return

    setIsTranscribing(true)
    toast.loading('Transcribing audio...', { id: 'transcribe' })

    try {
      const audioBlob = new Blob(audioChunks, { type: 'audio/wav' })
      
      // Convert to base64 for transcription
      const base64Audio = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => {
          const dataUrl = reader.result as string
          const base64Data = dataUrl.split(',')[1]
          resolve(base64Data)
        }
        reader.onerror = reject
        reader.readAsDataURL(audioBlob)
      })

      // Transcribe audio using Blink AI
      const { text } = await blink.ai.transcribeAudio({
        audio: base64Audio,
        language: 'en'
      })

      // Create new note with transcribed text
      const noteTitle = newNoteTitle.trim() || `Voice Note ${new Date().toLocaleDateString()}`
      const newNote = await blink.db.notes.create({
        title: noteTitle,
        content: text,
        user_id: user.id,
        duration: recordingTime
      })

      setNotes(prev => [newNote, ...prev])
      setCurrentNote(newNote)
      setNewNoteTitle('')
      
      toast.success('Recording transcribed successfully!', { id: 'transcribe' })
    } catch (error) {
      console.error('Error transcribing audio:', error)
      toast.error('Failed to transcribe audio', { id: 'transcribe' })
    } finally {
      setIsTranscribing(false)
      setAudioChunks([])
    }
  }

  const saveNote = async () => {
    if (!currentNote) return

    try {
      const updatedNote = await blink.db.notes.update(currentNote.id, {
        content: currentNote.content,
        title: currentNote.title,
        updated_at: new Date().toISOString()
      })
      
      setNotes(prev => prev.map(note => 
        note.id === updatedNote.id ? updatedNote : note
      ))
      toast.success('Note saved!')
    } catch (error) {
      console.error('Error saving note:', error)
      toast.error('Failed to save note')
    }
  }

  const deleteNote = async (noteId: string) => {
    try {
      await blink.db.notes.delete(noteId)
      setNotes(prev => prev.filter(note => note.id !== noteId))
      if (currentNote?.id === noteId) {
        setCurrentNote(null)
      }
      toast.success('Note deleted!')
    } catch (error) {
      console.error('Error deleting note:', error)
      toast.error('Failed to delete note')
    }
  }

  const createNewNote = () => {
    const newNote: Note = {
      id: `temp-${Date.now()}`,
      title: 'New Note',
      content: '',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      user_id: user?.id || ''
    }
    setCurrentNote(newNote)
  }

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center">
        <Card className="w-96">
          <CardHeader className="text-center">
            <CardTitle className="text-2xl">AI Voice Notes</CardTitle>
            <CardDescription>Please sign in to continue</CardDescription>
          </CardHeader>
        </Card>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-indigo-50">
      {/* Header */}
      <div className="border-b bg-white/80 backdrop-blur-md">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center space-x-3">
              <div className="w-8 h-8 bg-gradient-to-r from-blue-500 to-indigo-600 rounded-lg flex items-center justify-center">
                <Volume2 className="w-5 h-5 text-white" />
              </div>
              <h1 className="text-xl font-semibold bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">
                AI Voice Notes
              </h1>
            </div>
            <div className="flex items-center space-x-3">
              <Badge variant="secondary" className="text-xs">
                {user.email}
              </Badge>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Recording Panel */}
          <div className="lg:col-span-1">
            <Card className="mb-6 bg-white/70 backdrop-blur-sm border-0 shadow-xl">
              <CardHeader className="text-center pb-4">
                <CardTitle className="text-lg font-medium">Voice Recording</CardTitle>
                <CardDescription>Record your voice and convert it to text instantly</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="text-center">
                  <AnimatePresence>
                    {isRecording && (
                      <motion.div
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        exit={{ scale: 0 }}
                        className="mb-4"
                      >
                        <div className="text-3xl font-mono text-red-500 mb-2">
                          {formatTime(recordingTime)}
                        </div>
                        <div className="flex justify-center">
                          <motion.div
                            animate={{ scale: [1, 1.2, 1] }}
                            transition={{ repeat: Infinity, duration: 1 }}
                            className="w-4 h-4 bg-red-500 rounded-full"
                          />
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  <div className="space-y-3">
                    {!isRecording ? (
                      <div className="space-y-3">
                        <Input
                          placeholder="Note title (optional)"
                          value={newNoteTitle}
                          onChange={(e) => setNewNoteTitle(e.target.value)}
                          className="text-center"
                        />
                        <Button 
                          onClick={startRecording}
                          size="lg"
                          className="w-full h-12 bg-gradient-to-r from-red-500 to-red-600 hover:from-red-600 hover:to-red-700"
                          disabled={isTranscribing}
                        >
                          <Mic className="w-5 h-5 mr-2" />
                          Start Recording
                        </Button>
                      </div>
                    ) : (
                      <div className="flex gap-2">
                        {!isPaused ? (
                          <Button 
                            onClick={pauseRecording}
                            variant="outline"
                            size="lg"
                            className="flex-1"
                          >
                            <Pause className="w-4 h-4 mr-2" />
                            Pause
                          </Button>
                        ) : (
                          <Button 
                            onClick={resumeRecording}
                            variant="outline"
                            size="lg"
                            className="flex-1"
                          >
                            <Play className="w-4 h-4 mr-2" />
                            Resume
                          </Button>
                        )}
                        <Button 
                          onClick={stopRecording}
                          size="lg"
                          className="flex-1 bg-gray-600 hover:bg-gray-700"
                        >
                          <MicOff className="w-4 h-4 mr-2" />
                          Stop
                        </Button>
                      </div>
                    )}
                  </div>
                </div>

                {isTranscribing && (
                  <Alert>
                    <Volume2 className="h-4 w-4" />
                    <AlertDescription>
                      AI is transcribing your recording...
                    </AlertDescription>
                  </Alert>
                )}
              </CardContent>
            </Card>

            {/* Notes List */}
            <Card className="bg-white/70 backdrop-blur-sm border-0 shadow-xl">
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="text-lg font-medium">Your Notes</CardTitle>
                <Button
                  onClick={createNewNote}
                  size="sm"
                  variant="outline"
                >
                  <PlusCircle className="w-4 h-4 mr-1" />
                  New
                </Button>
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-96">
                  <div className="space-y-2">
                    {notes.map((note) => (
                      <motion.div
                        key={note.id}
                        layout
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        whileHover={{ scale: 1.02 }}
                        className={`p-3 rounded-lg border cursor-pointer transition-all ${
                          currentNote?.id === note.id 
                            ? 'bg-blue-50 border-blue-200' 
                            : 'bg-white hover:bg-gray-50'
                        }`}
                        onClick={() => setCurrentNote(note)}
                      >
                        <div className="flex items-start justify-between">
                          <div className="flex-1 min-w-0">
                            <h3 className="font-medium text-sm truncate">
                              {note.title}
                            </h3>
                            <p className="text-xs text-gray-500 mt-1 line-clamp-2">
                              {note.content}
                            </p>
                            <div className="flex items-center gap-2 mt-2">
                              <Clock className="w-3 h-3 text-gray-400" />
                              <span className="text-xs text-gray-500">
                                {new Date(note.created_at).toLocaleDateString()}
                              </span>
                              {note.duration && (
                                <Badge variant="secondary" className="text-xs">
                                  {formatTime(note.duration)}
                                </Badge>
                              )}
                            </div>
                          </div>
                        </div>
                      </motion.div>
                    ))}
                    {notes.length === 0 && (
                      <div className="text-center py-8 text-gray-500">
                        <FileText className="w-12 h-12 mx-auto mb-3 text-gray-300" />
                        <p>No notes yet</p>
                        <p className="text-sm">Start recording to create your first note!</p>
                      </div>
                    )}
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>
          </div>

          {/* Note Editor */}
          <div className="lg:col-span-2">
            <Card className="h-full bg-white/70 backdrop-blur-sm border-0 shadow-xl">
              <CardHeader className="flex flex-row items-center justify-between">
                <div className="flex-1">
                  {currentNote ? (
                    <Input
                      value={currentNote.title}
                      onChange={(e) => setCurrentNote({
                        ...currentNote,
                        title: e.target.value
                      })}
                      className="text-lg font-medium border-0 p-0 h-auto bg-transparent focus-visible:ring-0"
                      placeholder="Note title"
                    />
                  ) : (
                    <CardTitle className="text-lg font-medium text-gray-400">
                      Select a note to edit
                    </CardTitle>
                  )}
                </div>
                {currentNote && (
                  <div className="flex items-center gap-2">
                    <Button
                      onClick={saveNote}
                      size="sm"
                      className="bg-green-600 hover:bg-green-700"
                    >
                      <Save className="w-4 h-4 mr-1" />
                      Save
                    </Button>
                    <Button
                      onClick={() => deleteNote(currentNote.id)}
                      size="sm"
                      variant="destructive"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                )}
              </CardHeader>
              <Separator />
              <CardContent className="flex-1">
                {currentNote ? (
                  <div className="h-full">
                    <Textarea
                      value={currentNote.content}
                      onChange={(e) => setCurrentNote({
                        ...currentNote,
                        content: e.target.value
                      })}
                      placeholder="Start typing or record your voice to add content..."
                      className="h-96 resize-none border-0 focus-visible:ring-0 text-base leading-relaxed"
                    />
                  </div>
                ) : (
                  <div className="h-96 flex items-center justify-center text-gray-400">
                    <div className="text-center">
                      <FileText className="w-16 h-16 mx-auto mb-4 text-gray-200" />
                      <p className="text-lg">Select a note to start editing</p>
                      <p className="text-sm">Or record a new voice note to get started</p>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  )
}

export default App