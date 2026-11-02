
import passport from 'passport'
import { Strategy as GoogleStrategy } from 'passport-google-oauth20'
import { Strategy as GitHubStrategy } from 'passport-github2'
import User from '../Models/User'

type GitHubProfile = {
  id: string
  displayName?: string
  username?: string
  emails?: Array<{
    value: string
    verified?: boolean
    primary?: boolean
  }>
  photos?: Array<{
    value: string
  }>
}

type OAuthDone = (
  error: Error | null,
  user?: Express.User | false,
) => void

export function isOAuthConfigured(
  provider: 'google' | 'github',
): boolean {
  if (provider === 'google') {
    return Boolean(
      process.env.GOOGLE_CLIENT_ID &&
      process.env.GOOGLE_CLIENT_SECRET &&
      process.env.GOOGLE_CALLBACK_URL,
    )
  }

  return Boolean(
    process.env.GITHUB_CLIENT_ID &&
    process.env.GITHUB_CLIENT_SECRET &&
    process.env.GITHUB_CALLBACK_URL,
  )
}

export function configurePassport(): void {
  // --------------------------------------------------
  // GOOGLE OAUTH
  // --------------------------------------------------

  if (isOAuthConfigured('google')) {
    passport.use(
      new GoogleStrategy(
        {
          clientID: process.env.GOOGLE_CLIENT_ID!,
          clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
          callbackURL: process.env.GOOGLE_CALLBACK_URL!,
        },
        async (_accessToken, _refreshToken, profile, done) => {
          try {
            const email = profile.emails?.[0]?.value
              ?.trim()
              .toLowerCase()

            // Only accept Google's verified email.
            if (
              !email ||
              profile._json.email_verified !== true
            ) {
              return done(null, false)
            }

            // First, check whether this Google account
            // is already linked to an IntellMeet account.
            let user = await User.findOne({
              googleId: profile.id,
            })

            if (!user) {
              // Check whether this email already belongs
              // to an email/password account.
              user = await User.findOne({ email })

              if (user) {
                // Never replace a different Google account.
                if (
                  user.googleId &&
                  user.googleId !== profile.id
                ) {
                  return done(null, false)
                }

                // Link Google to the existing account.
                user.googleId = profile.id

                // Preserve an existing profile photo.
                if (
                  !user.profilePhoto &&
                  profile.photos?.[0]?.value
                ) {
                  user.profilePhoto =
                    profile.photos[0].value
                }

                await user.save()
              } else {
                // Create a new account if the email
                // does not already exist.
                user = await User.create({
                  name:
                    profile.displayName ||
                    email.split('@')[0],
                  email,
                  googleId: profile.id,
                  profilePhoto:
                    profile.photos?.[0]?.value || '',
                })
              }
            }

            return done(null, user)
          } catch (error) {
            console.error('Google OAuth failed:', error)
            return done(error as Error)
          }
        },
      ),
    )
  }

  // --------------------------------------------------
  // GITHUB OAUTH
  // --------------------------------------------------

  if (isOAuthConfigured('github')) {
    passport.use(
      new GitHubStrategy(
        {
          clientID: process.env.GITHUB_CLIENT_ID!,
          clientSecret: process.env.GITHUB_CLIENT_SECRET!,
          callbackURL: process.env.GITHUB_CALLBACK_URL!,
          scope: ['user:email'],
        },
        async (
          _accessToken: string,
          _refreshToken: string,
          profile: GitHubProfile,
          done: OAuthDone,
        ) => {
          try {
            const verifiedEmail = profile.emails?.find(
              (item) =>
                item.verified === true &&
                item.primary === true,
            )?.value

            const email = verifiedEmail
              ?.trim()
              .toLowerCase()

            if (!email) {
              return done(null, false)
            }

            let user = await User.findOne({
              githubId: profile.id,
            })

            if (!user) {
              user = await User.findOne({ email })

              if (user) {
                if (
                  user.githubId &&
                  user.githubId !== profile.id
                ) {
                  return done(null, false)
                }

                user.githubId = profile.id

                if (
                  !user.profilePhoto &&
                  profile.photos?.[0]?.value
                ) {
                  user.profilePhoto =
                    profile.photos[0].value
                }

                await user.save()
              } else {
                user = await User.create({
                  name:
                    profile.displayName ||
                    profile.username ||
                    email.split('@')[0],
                  email,
                  githubId: profile.id,
                  profilePhoto:
                    profile.photos?.[0]?.value || '',
                })
              }
            }

            return done(null, user)
          } catch (error) {
            console.error('GitHub OAuth failed:', error)
            return done(error as Error)
          }
        },
      ),
    )
  }
}
