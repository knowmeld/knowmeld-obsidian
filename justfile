_bump part:
    #!/usr/bin/env bash
    set -e
    current=$(jq -r '.version' manifest.json)
    IFS='.' read -r major minor patch <<< "$current"
    case "{{part}}" in
      major) major=$((major + 1)); minor=0; patch=0 ;;
      minor) minor=$((minor + 1)); patch=0 ;;
      patch) patch=$((patch + 1)) ;;
    esac
    version="$major.$minor.$patch"
    tag="v$version"

    tmp=$(mktemp)
    jq --arg v "$version" '.version = $v' manifest.json > "$tmp" && mv "$tmp" manifest.json

    tmp=$(mktemp)
    jq --arg v "$version" '.version = $v' package.json > "$tmp" && mv "$tmp" package.json

    echo "Bumped version to $version"

    git add manifest.json package.json
    git commit -m "chore: release $tag"
    # Use an annotated tag so pushing tags is deterministic and compatible with --follow-tags semantics.
    git tag -a "$tag" -m "Release $tag"
    git push origin HEAD:main
    git push origin "$tag"

    echo "Pushed $tag — release workflow will trigger shortly."

release-patch: (_bump "patch")
release-minor: (_bump "minor")
release-major: (_bump "major")
