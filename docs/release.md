# Releasing

We use [Changesets](https://github.com/changesets/changesets) to version and release our packages.

When you're ready to cut a release, start by versioning the packages:

```
npx changeset version
```

This will consume the changesets in [`.changeset`](../.changeset) and update the [changelog](../CHANGELOG.md) and [`package.json`](../package.json):

```
% git status --short
 M CHANGELOG.md
 M package.json
```

Since we updated the `package.json`, we should also update the lockfile ([`package-lock.json`](../package-lock.json)) for tidiness:

```
npm install
```

Now the lockfile should be updated:

```
% git status --short
 M CHANGELOG.md
 M package-lock.json
 M package.json
```

At this point we're ready to commit our changes.
It's probably a good idea to have some consistency around the name of this commit message:

```
git commit -m 'version packages'
```

Ok, now it's time to publish the release.
Before we do, we have to build the artifacts that comprise the tarball.
Let's clean our working directory first so that we don't accidentally include anything in the tarball that shouldn't be there:

```
git clean -fxd -e .env
```

Now let's build the artifacts:

```
npm run build
```

We're ready to publish to NPM:

```
npx changeset publish
```

Changeset created an annotated git tag.
Let's push the commit and tag to GitHub:

```
git push --follow-tags
```
