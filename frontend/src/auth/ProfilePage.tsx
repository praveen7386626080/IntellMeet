
import {
  useCallback,
  useEffect,
  useState,
  type FormEvent,
  type ChangeEvent,
} from 'react'

import './ProfilePage.css'
import { useAuth } from './AuthContext'

const API_BASE =
  import.meta.env.VITE_API_URL || 'http://localhost:5000/api'

type Profile = {
  id?: string
  _id?: string
  name: string
  email: string
  phoneNumber?: string
  designation?: string
  bio?: string
  profilePhoto?: string
  role?: string
}

async function readMessage(response: Response): Promise<string> {
  try {
    const body = await response.json()
    return (
      body.message ||
      body.error ||
      'Something went wrong. Please try again.'
    )
  } catch {
    return 'Something went wrong. Please try again.'
  }
}

export default function ProfilePage() {
  const { token, user, signOut } = useAuth()

  const [profile, setProfile] = useState<Profile>({
    name: user?.name || '',
    email: user?.email || '',
    role: user?.role || 'member',
  })

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)

  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')

  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')

  const [deletePassword, setDeletePassword] = useState('')
  const [deletePhrase, setDeletePhrase] = useState('')
  const [deleteToken, setDeleteToken] = useState('')
  const [deleting, setDeleting] = useState(false)

  const headers = useCallback(
    (): HeadersInit => ({
      Authorization: `Bearer ${token}`,
    }),
    [token],
  )

  // Load profile information
  useEffect(() => {
    const controller = new AbortController()

    async function loadProfile() {
      if (!token) {
        setLoading(false)
        return
      }

      try {
        const response = await fetch(`${API_BASE}/profile/me`, {
          headers: headers(),
          signal: controller.signal,
        })

        if (!response.ok) {
          throw new Error(await readMessage(response))
        }

        const body = await response.json()
        const data = body.user || body.profile || body

        setProfile((previous) => ({
          ...previous,
          ...data,
          name: data.name ?? previous.name,
          email: data.email ?? previous.email,
        }))
      } catch (err) {
        if (!controller.signal.aborted) {
          setError(
            err instanceof Error
              ? err.message
              : 'Could not load profile.',
          )
        }
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false)
        }
      }
    }

    void loadProfile()

    return () => controller.abort()
  }, [headers, token])

  function updateField(
    field: 'name' | 'phoneNumber' | 'designation' | 'bio',
    value: string,
  ) {
    setProfile((current) => ({
      ...current,
      [field]: value,
    }))
  }

  // Save profile information
  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    setError('')
    setNotice('')
    setSaving(true)

    try {
      const response = await fetch(`${API_BASE}/profile/me`, {
        method: 'PATCH',
        headers: {
          ...headers(),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: profile.name,
          phoneNumber: profile.phoneNumber || '',
          designation: profile.designation || '',
          bio: profile.bio || '',
        }),
      })

      if (!response.ok) {
        throw new Error(await readMessage(response))
      }

      const body = await response.json().catch(() => ({}))

      setProfile((current) => ({
        ...current,
        ...(body.user || body.profile || {}),
      }))

      setNotice('Your profile has been saved.')
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Could not save profile.',
      )
    } finally {
      setSaving(false)
    }
  }

  // Upload profile photo
  async function uploadPhoto(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''

    if (!file) return

    if (!file.type.startsWith('image/')) {
      setError('Choose an image file.')
      return
    }

    if (file.size > 5 * 1024 * 1024) {
      setError('Choose an image smaller than 5 MB.')
      return
    }

    setError('')
    setNotice('')
    setUploading(true)

    try {
      const form = new FormData()
      form.append('photo', file)

      const response = await fetch(`${API_BASE}/profile/me/photo`, {
        method: 'POST',
        headers: headers(),
        body: form,
      })

      if (!response.ok) {
        throw new Error(await readMessage(response))
      }

      const body = await response.json()
      const data = body.user || body.profile || body

      setProfile((current) => ({
        ...current,
        profilePhoto:
          data.profilePhoto ||
          data.photoUrl ||
          data.url ||
          current.profilePhoto,
      }))

      setNotice('Profile photo updated.')
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Could not upload photo.',
      )
    } finally {
      setUploading(false)
    }
  }

  // Remove profile photo
  async function removePhoto() {
    setError('')
    setNotice('')

    try {
      const response = await fetch(`${API_BASE}/profile/me/photo`, {
        method: 'DELETE',
        headers: headers(),
      })

      if (!response.ok) {
        throw new Error(await readMessage(response))
      }

      setProfile((current) => ({
        ...current,
        profilePhoto: '',
      }))

      setNotice('Profile photo removed.')
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Could not remove photo.',
      )
    }
  }

  // Change password
  async function changePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    setError('')
    setNotice('')

    if (
      !currentPassword.trim() ||
      !newPassword ||
      !confirmPassword
    ) {
      setError(
        'Current password, new password, and confirmation are required.',
      )
      return
    }

    if (newPassword.length < 8 || newPassword.length > 72) {
      setError('New password must contain between 8 and 72 characters.')
      return
    }

    if (newPassword !== confirmPassword) {
      setError('The new passwords do not match.')
      return
    }

    if (currentPassword === newPassword) {
      setError(
        'Your new password must be different from your current password.',
      )
      return
    }

    try {
      setSaving(true)

      const response = await fetch(
        `${API_BASE}/profile/me/password`,
        {
          method: 'PATCH',
          headers: {
            ...headers(),
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            currentPassword,
            newPassword,
            confirmNewPassword: confirmPassword,
          }),
        },
      )

      if (!response.ok) {
        throw new Error(await readMessage(response))
      }

      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')

      const body = await response.json().catch(() => ({}))

      setNotice(
        body.message ||
          'Password changed successfully. Please log in again.',
      )
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Could not change password.',
      )
    } finally {
      setSaving(false)
    }
  }

  // Request account deletion
  async function requestDeletion(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    setError('')
    setNotice('')
    setDeleteToken('')
    setDeleting(true)

    try {
      const response = await fetch(
        `${API_BASE}/profile/me/delete/request`,
        {
          method: 'POST',
          headers: {
            ...headers(),
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            currentPassword: deletePassword,
          }),
        },
      )

      if (!response.ok) {
        throw new Error(await readMessage(response))
      }

      const body = await response.json()

      const returnedToken =
        body.confirmationToken ||
        body.deleteToken ||
        body.token

      if (returnedToken) {
        setDeleteToken(returnedToken)

        setNotice(
          'Confirmation started. Type DELETE MY ACCOUNT below to continue.',
        )
      } else {
        setNotice(
          body.message ||
            'Deletion confirmation was requested. Check the server response for the confirmation process.',
        )
      }
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Could not start account deletion.',
      )
    } finally {
      setDeleting(false)
    }
  }

  // Confirm account deletion
  async function confirmDeletion(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (deletePhrase !== 'DELETE MY ACCOUNT') {
      setError('Type DELETE MY ACCOUNT exactly to confirm.')
      return
    }

    if (!deleteToken) {
      setError(
        'Request account deletion first, then use the confirmation token returned by the server.',
      )
      return
    }

    setError('')
    setNotice('')
    setDeleting(true)

    try {
      const response = await fetch(
        `${API_BASE}/profile/me/delete/confirm`,
        {
          method: 'POST',
          headers: {
            ...headers(),
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            confirmationToken: deleteToken,
            confirmationText: deletePhrase,
          }),
        },
      )

      if (!response.ok) {
        throw new Error(await readMessage(response))
      }

      signOut()
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Could not delete account.',
      )
    } finally {
      setDeleting(false)
    }
  }

  // Log out from the profile section
  function handleLogout() {
    signOut()
  }

  const initials = (profile.name || user?.name || 'U')
    .trim()
    .split(/\s+/)
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()

  if (loading) {
    return (
      <section className="profile-loading">
        Loading your profile…
      </section>
    )
  }

  return (
    <div className="profile-page">
      {/* Profile heading */}
      <div className="profile-intro">
        <div>
          <p className="eyebrow">ACCOUNT SETTINGS</p>
          <h2>Your profile</h2>
          <p className="profile-subtitle">
            Manage your personal information and account security.
          </p>
        </div>

        <span className="profile-status">
          <i />
          Account active
        </span>
      </div>

      {/* Success and error messages */}
      {notice && (
        <div className="profile-alert success" role="status">
          {notice}
        </div>
      )}

      {error && (
        <div className="profile-alert error" role="alert">
          {error}
        </div>
      )}

      {/* Profile identity */}
      <section className="profile-card profile-identity">
        <div className="profile-avatar-large">
          {profile.profilePhoto ? (
            <img src={profile.profilePhoto} alt="Your profile" />
          ) : (
            <span>{initials}</span>
          )}
        </div>

        <div className="profile-identity-copy">
          <h3>{profile.name || 'Your name'}</h3>
          <p>{profile.email}</p>

          <span className="profile-role">
            {profile.designation ||
              profile.role ||
              'Workspace member'}
          </span>
        </div>

        <div className="profile-photo-actions">
          <label className="profile-button primary">
            {uploading ? 'Uploading…' : 'Upload photo'}

            <input
              type="file"
              accept="image/*"
              onChange={uploadPhoto}
              disabled={uploading}
            />
          </label>

          {profile.profilePhoto && (
            <button
              className="profile-button"
              type="button"
              onClick={removePhoto}
            >
              Remove
            </button>
          )}

          <small>JPG, PNG or WEBP · up to 5 MB</small>
        </div>
      </section>

      {/* Personal information */}
      <section className="profile-card">
        <div className="profile-section-heading">
          <div>
            <h3>Personal information</h3>
            <p>Keep your profile details up to date.</p>
          </div>

          <span className="profile-section-icon">✦</span>
        </div>

        <form className="profile-form" onSubmit={saveProfile}>
          <label>
            Full name
            <input
              required
              maxLength={80}
              value={profile.name}
              onChange={(e) =>
                updateField('name', e.target.value)
              }
            />
          </label>

          <label>
            Email address
            <input value={profile.email} readOnly disabled />
            <small>Email address is managed by your account.</small>
          </label>

          <label>
            Phone number
            <input
              type="tel"
              maxLength={25}
              value={profile.phoneNumber || ''}
              placeholder="+91 00000 00000"
              onChange={(e) =>
                updateField('phoneNumber', e.target.value)
              }
            />
          </label>

          <label>
            Job title / designation
            <input
              maxLength={100}
              value={profile.designation || ''}
              placeholder="e.g. Full Stack Developer"
              onChange={(e) =>
                updateField('designation', e.target.value)
              }
            />
          </label>

          <label className="full-width">
            About you
            <textarea
              rows={4}
              maxLength={500}
              value={profile.bio || ''}
              placeholder="Share a little about yourself…"
              onChange={(e) =>
                updateField('bio', e.target.value)
              }
            />

            <small>
              {(profile.bio || '').length}/500 characters
            </small>
          </label>

          <div className="profile-form-actions">
            <button
              className="profile-button primary"
              type="submit"
              disabled={saving}
            >
              {saving ? 'Saving…' : 'Save changes'}
            </button>
          </div>
        </form>
      </section>

      {/* Change password */}
      <section className="profile-card">
        <div className="profile-section-heading">
          <div>
            <h3>Change password</h3>
            <p>Use a strong password you don’t use elsewhere.</p>
          </div>

          <span className="profile-section-icon">⌑</span>
        </div>

        <form
          className="profile-form password-form"
          onSubmit={changePassword}
        >
          <label>
            Current password
            <input
              type="password"
              autoComplete="current-password"
              required
              value={currentPassword}
              onChange={(e) =>
                setCurrentPassword(e.target.value)
              }
            />
          </label>

          <label>
            New password
            <input
              type="password"
              autoComplete="new-password"
              minLength={8}
              maxLength={72}
              required
              value={newPassword}
              onChange={(e) =>
                setNewPassword(e.target.value)
              }
            />

            <small>At least 8 characters.</small>
          </label>

          <label>
            Confirm new password
            <input
              type="password"
              autoComplete="new-password"
              minLength={8}
              maxLength={72}
              required
              value={confirmPassword}
              onChange={(e) =>
                setConfirmPassword(e.target.value)
              }
            />
          </label>

          <div className="profile-form-actions">
            <button
              className="profile-button primary"
              type="submit"
              disabled={saving}
            >
              {saving ? 'Updating…' : 'Update password'}
            </button>
          </div>
        </form>
      </section>

      {/* Delete account */}
      <section className="profile-card profile-danger-card">
        <div className="profile-section-heading">
          <div>
            <h3>Delete account</h3>
            <p>
              Account deletion is permanent and may remove access
              to your IntellMeet data.
            </p>
          </div>

          <span className="profile-section-icon danger-icon">
            !
          </span>
        </div>

        <form className="profile-form" onSubmit={requestDeletion}>
          <label>
            Confirm your current password
            <input
              type="password"
              autoComplete="current-password"
              required
              value={deletePassword}
              onChange={(e) =>
                setDeletePassword(e.target.value)
              }
            />
          </label>

          <div className="profile-form-actions">
            <button
              className="profile-button danger"
              type="submit"
              disabled={deleting}
            >
              {deleting ? 'Please wait…' : 'Start deletion'}
            </button>
          </div>
        </form>

        {deleteToken && (
          <form
            className="profile-form delete-confirm-form"
            onSubmit={confirmDeletion}
          >
            <p className="delete-warning">
              This action cannot be undone. Type{' '}
              <strong>DELETE MY ACCOUNT</strong> exactly to confirm.
            </p>

            <label>
              Confirmation phrase
              <input
                required
                value={deletePhrase}
                onChange={(e) =>
                  setDeletePhrase(e.target.value)
                }
                placeholder="DELETE MY ACCOUNT"
              />
            </label>

            <div className="profile-form-actions">
              <button
                className="profile-button danger"
                type="submit"
                disabled={deleting}
              >
                {deleting
                  ? 'Deleting…'
                  : 'Permanently delete account'}
              </button>
            </div>
          </form>
        )}
      </section>

      {/* Sign out / logout */}
      <section className="profile-card profile-logout-card">
        <div className="profile-section-heading">
          <div>
            <h3>Sign out</h3>
            <p>
              Sign out of your IntellMeet account on this device.
            </p>
          </div>

          <span className="profile-section-icon profile-logout-icon">
            ↪
          </span>
        </div>

        <div className="profile-logout-content">
          <p>
            You can sign in again whenever you want to continue
            your work.
          </p>

          <button
            type="button"
            className="profile-button danger profile-logout-button"
            onClick={handleLogout}
          >
            <span aria-hidden="true">↪</span>
            Log out
          </button>
        </div>
      </section>
    </div>
  )
}
