# Post images: S3 + CloudFront

Post images are never committed to Git and never end up in the GitHub Pages
build. While writing, they sit next to the post. One command uploads them to a
private S3 bucket served through CloudFront, rewrites the post to the
CloudFront URLs, records their sizes in a committed manifest, and moves the
originals into a local archive folder. GitHub Actions never touches AWS.

```
src/content/blog/trip/index.md     cover: ./cover.jpg      ![..](./shot.jpg)
                                            │  npm run images:publish
                                            ▼
s3://<bucket>/blog/trip/cover-a1b2c3d4.webp (+ -480, -960, -1600 variants)
https://<cdn>/blog/trip/cover-a1b2c3d4.webp  ← written into index.md
src/data/image-manifest.json                 ← width, height, variant widths (committed)
.image-archive/trip/cover.jpg                ← the original (gitignored)
```

What is committed: the rewritten posts and `src/data/image-manifest.json`.
What is not: image files under `src/content/`, `.image-archive/`, `.env`.

## One-time setup

You do this once. It takes about 30 minutes, most of it waiting for
CloudFront. You need an AWS account and a terminal in the project folder.

Three IAM users are involved, each with as little access as works:

| User / profile   | Can do                                                                 | Used for |
| ---------------- | ---------------------------------------------------------------------- | -------- |
| `wuwo-blog-admin`     | everything (`AdministratorAccess`)                                     | setup only (steps 2–8), then its keys are deleted (step 9) |
| `wuwo-blog-deployer`  | assume the roles CDK created at bootstrap, nothing else                | `cdk deploy` now and whenever `infra/` changes |
| `wuwo-blog-publisher` (profile `wuwo-blog-publisher`) | put and read objects in the images bucket; list it. No delete | `npm run images:publish` |

`cdk deploy` does not use the deployer's own rights: CDK hands the template to
CloudFormation, which runs as a role created at bootstrap. That role gets
`infra/policies/wuwo-blog-cdk-execution.json` instead of CDK's default
`AdministratorAccess`. It can manage only buckets named `wuwo-blog-images-*`,
CloudFront, and IAM policies named `wuwo-blog-images-*`, and read certificates and
CDK's version parameter.

Commands below run in `infra/` and use a shell variable for your account ID,
so run them in the same terminal window.

### 1. Install the AWS CLI

```sh
brew install awscli
aws --version                        # aws-cli/2.x …
```

Without Homebrew: download the macOS installer from
<https://docs.aws.amazon.com/cli/latest/userguide/getting-started-install.html>.

### 2. Create the temporary admin user

1. AWS console (signed in as the root user or another administrator) →
   **IAM** → **Users** → **Create user** `wuwo-blog-admin` → **Attach policies
   directly** → `AdministratorAccess` → **Create user**.
2. Open `wuwo-blog-admin` → **Security credentials** → **Create access key** →
   **Command Line Interface (CLI)** → copy both values.
3. In the terminal:

   ```sh
   aws configure --profile wuwo-blog-admin
   # AWS Access Key ID / Secret Access Key: from step 2
   # Default region name: the region for the bucket, e.g. eu-west-1
   # Default output format: json
   ```

4. Check it, and keep the account ID in a variable:

   ```sh
   aws sts get-caller-identity --profile wuwo-blog-admin
   ACCOUNT=$(aws sts get-caller-identity --profile wuwo-blog-admin --query Account --output text)
   REGION=$(aws configure get region --profile wuwo-blog-admin)
   echo "$ACCOUNT $REGION"
   ```

   If `get-caller-identity` fails, fix that first: CDK fails with "Unable to
   resolve AWS account to use" for the same reason.

### 3. Set the blog's origin (and optionally the image domain)

Open `infra/cdk.json` and set `allowedOrigin` to the address the blog is served
from, with `https://` and without a trailing slash:

```json
"allowedOrigin": "https://wuwo.blog",
```

On GitHub Pages without a custom domain this is `https://<username>.github.io`.
The value is used for CORS only; plain `<img>` tags load the images on any site.

**Own image domain** (e.g. `static.wuwo.blog`; skip to use the
`dxxxx.cloudfront.net` domain):

1. AWS console → **Certificate Manager**, switch the region to
   **us-east-1 (N. Virginia)** (CloudFront only accepts certificates from
   there) → **Request** → public certificate for `static.wuwo.blog` → DNS
   validation → add the CNAME record it shows at your DNS provider → wait for
   **Issued**. Copy the certificate ARN.
2. Set both values in `infra/cdk.json`:

   ```json
   "domainName": "static.wuwo.blog",
   "certificateArn": "arn:aws:acm:us-east-1:123456789012:certificate/…",
   ```

The DNS record for `static` comes after the deploy (step 7).

### 4. Create the two CDK policies

```sh
cd infra
npm install

aws iam create-policy --profile wuwo-admin \
  --policy-name wuwo-blog-cdk-execution \
  --policy-document file://policies/wuwo-blog-cdk-execution.json

aws iam create-policy --profile wuwo-admin \
  --policy-name wuwo-blog-cdk-deployer \
  --policy-document file://policies/wuwo-blog-cdk-deployer.json
```

### 5. Bootstrap CDK with the limited execution policy

```sh
npx cdk bootstrap --profile wuwo-admin \
  --cloudformation-execution-policies "arn:aws:iam::$ACCOUNT:policy/wuwo-blog-cdk-execution"
```

This creates the `CDKToolkit` stack: a staging bucket and the roles CDK uses
to deploy. The `--cloudformation-execution-policies` flag replaces CDK's
default `AdministratorAccess` for CloudFormation. (If the account was
bootstrapped before, running this again updates it.)

### 6. Create the deployer user

```sh
aws iam create-user --user-name wuwo-blog-deployer --profile wuwo-admin
aws iam attach-user-policy --user-name wuwo-blog-deployer --profile wuwo-admin \
  --policy-arn "arn:aws:iam::$ACCOUNT:policy/wuwo-blog-cdk-deployer"
aws iam create-access-key --user-name wuwo-blog-deployer --profile wuwo-admin
```

The last command prints `AccessKeyId` and `SecretAccessKey`. Then:

```sh
aws configure --profile wuwo-blog-deployer
# paste the two values; region: the same as wuwo-blog-admin ($REGION); output: json
```

### 7. Deploy (as the deployer)

```sh
npx cdk deploy --profile wuwo-blog-deployer
```

CDK lists the IAM changes and asks **Do you wish to deploy these changes
(y/n)?**: answer `y`. Creating the CloudFront distribution takes 5–15
minutes. At the end, CDK prints the outputs:

```
Outputs:
WuwoBlogImages.BucketName = wuwo-blog-images-123456789012-eu-west-1
WuwoBlogImages.ImagesDomain = d111111abcdef8.cloudfront.net      (or static.wuwo.blog)
WuwoBlogImages.DistributionId = E1A2B3C4D5E6F7
WuwoBlogImages.PublisherPolicyArn = arn:aws:iam::123456789012:policy/wuwo-blog-images-publisher
WuwoBlogImages.PublisherPolicyName = wuwo-blog-images-publisher
```

To see them again later:
`aws cloudformation describe-stacks --stack-name WuwoBlogImages --profile wuwo-blog-admin --query "Stacks[0].Outputs"`
(as `wuwo-blog-deployer` this is not allowed; use the CloudFormation console).

With your own image domain: at your DNS provider, add a CNAME record
`static` → the distribution's `dxxxx.cloudfront.net` domain (CloudFront
console → the distribution → **Distribution domain name**). On Cloudflare, set
it to **DNS only** (grey cloud).

### 8. Create the publisher user

```sh
aws iam create-user --user-name wuwo-blog-publisher --profile wuwo-admin
aws iam attach-user-policy --user-name wuwo-blog-publisher --profile wuwo-admin \
  --policy-arn "arn:aws:iam::$ACCOUNT:policy/wuwo-blog-images-publisher"
aws iam create-access-key --user-name wuwo-blog-publisher --profile wuwo-admin
aws configure --profile wuwo-blog-publisher
# paste the two values; region: $REGION; output: json
```

Check it (prints nothing for an empty bucket, an error if access is wrong):

```sh
aws s3 ls "s3://wuwo-blog-images-$ACCOUNT-$REGION" --profile wuwo-blog-publisher
```

### 9. Remove the admin access

Setup is done; `wuwo-blog-admin` is no longer needed.

```sh
aws iam list-access-keys --user-name wuwo-blog-admin --profile wuwo-blog-admin
aws iam delete-access-key --user-name wuwo-blog-admin --profile wuwo-blog-admin \
  --access-key-id <AccessKeyId from the list>
```

Then delete the user in the console (IAM → Users → `wuwo-blog-admin` → **Delete**)
and remove `[wuwo-blog-admin]` from `~/.aws/credentials` and `[profile wuwo-blog-admin]`
from `~/.aws/config`. For a later change that needs admin rights (new users,
a wider execution policy), sign in to the console as root or another
administrator.

What each remaining user can do:

- `wuwo-blog-deployer` deploys this CDK app. Through the execution policy it can
  change the bucket, CloudFront and the `wuwo-blog-images-*` policies, nothing else
  in the account. (That includes what `wuwo-blog-images-publisher` allows, so keep
  its keys as safe as the account itself.)
- `wuwo-blog-publisher` uploads and reads images in one bucket. It cannot delete
  or overwrite-protect anything, list other buckets, or touch CloudFront.

### 10. Create `.env`

In the project root (not in `infra/`):

```sh
cd ..
cp .env.example .env
```

Fill it in with the outputs from step 7:

```sh
AWS_PROFILE=wuwo-blog-publisher                                   # the publisher profile from step 8
AWS_REGION=eu-west-1                               # the region you deployed to
S3_BUCKET=wuwo-blog-images-123456789012-eu-west-1       # BucketName
CLOUDFRONT_DOMAIN=static.wuwo.blog                 # ImagesDomain, no https://
```

The file is gitignored. The script uses the AWS SDK's default credential chain,
so anything that works for the AWS CLI (profiles, SSO, environment variables)
works here.

### 11. Set the domain in `src/site.config.ts`

```ts
images: {
  cdnDomain: 'static.wuwo.blog',   // = CLOUDFRONT_DOMAIN
  sizes: '(min-width: 960px) 1100px, 100vw',
},
```

The build runs in GitHub Actions without AWS access, so it reads the domain
from here. The script stops with an error if `.env` and this file disagree.

### 12. Install the Git hook

```sh
npm install
```

`simple-git-hooks` installs a pre-commit hook that refuses to commit a post
that still references local images, or any image file under `src/content/`.

### 13. Try it

```sh
npm run images:publish -- --dry-run      # what would happen; changes nothing
npm run images:publish -- --post <slug>  # publish one post
```

Open the URL from the rewritten post (`https://<cdn>/blog/<slug>/….webp`) in a
browser: the image must load. Then `npm run dev` shows the post with the
images from CloudFront.

## Daily workflow

For everything else about writing a post (frontmatter, wide covers, the
home page spotlight, captions), see [WRITING.md](./WRITING.md).

1. Create a folder for the post: `src/content/blog/<slug>/index.md` (or `.mdx`).
   The folder name is the URL: `/posts/<slug>/`.
2. Put the images in that folder and reference them relatively:

   ```md
   ---
   title: A morning in the valley
   cover: ./cover.jpg
   coverAlt: Granite cliffs above a still river
   ---

   ![Turquoise water below white cliffs](./coast.jpg)
   ```

   In MDX, import and use `Figure` or `PostImage` (not `Image` from `astro:assets`):

   ```mdx
   import Figure from '../../../components/mdx/Figure.astro';
   import coast from './coast.jpg';

   <Figure src={coast} alt="…" caption="…" width="wide" />
   ```

3. Preview with `npm run dev`. Local images render as usual.
4. Publish:

   ```sh
   npm run images:publish
   ```

   The command uploads the images, rewrites the references, updates
   `src/data/image-manifest.json` and moves the originals to `.image-archive/<slug>/`.
   Preview again if you like: the page now loads the images from CloudFront.
5. Commit and push. GitHub Actions checks, builds and deploys.

Options:

| Command                                        | Effect                                                     |
| ---------------------------------------------- | ---------------------------------------------------------- |
| `npm run images:publish`                       | publish every unpublished image under `src/content/`       |
| `npm run images:publish -- --post <slug>`      | one post only                                              |
| `npm run images:publish -- --dry-run`          | print what would happen; upload, write and move nothing    |
| `npm run images:publish -- --delete`           | delete the originals instead of archiving them             |
| `npm run images:publish -- --originals`        | add full-size download copies for images published earlier (from `.image-archive/`; posts are not changed) |
| `npm run images:check`                         | list unpublished references and loose image files; exit 1 if any (no AWS needed; CI runs this) |

### What the script does to each image

- JPEG, PNG, WebP, AVIF, HEIC: rotated according to EXIF, all metadata removed
  (EXIF, GPS, ICC; colours are converted to sRGB), width capped at 2400px,
  encoded as WebP (quality 80) at 480, 960, 1600 and 2400px, skipping widths
  larger than the original. The largest version has no width suffix; the
  variants do (`-480`).
- GIF and SVG: uploaded unchanged.
- Object names: `blog/<slug>/<name>-<hash8>.webp`, where the hash comes from
  the original file's bytes. The same file always maps to the same object, so
  re-running the command uploads nothing new, and objects are safe to cache for
  a year (`Cache-Control: public, max-age=31536000, immutable`).
- Nothing is ever deleted from S3.
- Files over 25 MB, missing files and failed uploads are reported; the post
  that references them is left unchanged.

### Full-size downloads

With `images.originals: true` in `src/site.config.ts` (the default), each
JPEG, PNG, WebP, AVIF or HEIC photo also gets a download copy:

- `blog/<slug>/<name>-<hash8>-original.jpg` (`.png`, `.webp`, `.avif`; HEIC
  becomes JPEG), at the photo's full resolution, rotated upright.
- EXIF and XMP metadata are removed: no GPS position, camera or date. The ICC
  colour profile is kept, so colours match your original. JPEGs are
  re-encoded at quality 95; PNGs stay lossless.
- Served with `Content-Disposition: attachment; filename="<name>.jpg"`, so
  the browser downloads it instead of opening it.
- Its size and URL are stored in the manifest (`original`).

The image viewer shows **Download original (5472 × 2736, 8.2 MB)** under the
caption for each photo that has a copy. Each post page lists its own copies in
a small JSON block (`src/components/ImageOriginals.astro`), so the link also
works for images whose Markdown output Astro has cached.

Photos published before this was switched on have no copy. Add them later
from the archive:

```sh
npm run images:publish -- --originals --dry-run   # what would be uploaded
npm run images:publish -- --originals             # upload and update the manifest
```

It looks up each published photo in `.image-archive/` by the content hash in
its URL, so a renamed file is still found and an edited one is not. Commit the
updated `src/data/image-manifest.json` afterwards. To stop offering downloads,
set `images.originals: false`: the links disappear on the next build (the
copies stay in S3, as nothing is ever deleted).

### What the build does with the URLs

A Markdown processor plugin (`src/lib/satteri-cdn-images.ts`) gives every
`<img>` on the CloudFront domain its `width`, `height`, `srcset`, `sizes`,
`decoding="async"` and `loading` from the manifest. The first image of a post
is `eager` when the post has no cover (it is then the largest thing above the
fold) and `lazy` otherwise. Covers go through `src/components/PostImage.astro`,
which does the same. Astro does not process these URLs (the domain is not in
`image.domains`), so no copies land in `dist/`.

## Where the originals go

`.image-archive/<slug>/` next to the project, gitignored. It is a convenience
copy on this machine only: **Git does not back it up**. If you want the
originals kept elsewhere, copy the folder to your own backup, or use `--delete`
and keep originals in your photo library.

## Replacing an image in a published post

1. Put the new file in the post folder and point the reference back at it:
   `cover: ./cover.jpg` or `![…](./shot.jpg)`.
2. Run `npm run images:publish`. The new file gets a new hash, so it becomes a
   new object; the old object stays in the bucket (nothing is deleted) but no
   post references it any more.
3. Commit the rewritten post and the manifest.

To change an image's `alt` text or caption, edit the post; no republish needed.

## Troubleshooting

- **`command not found: aws`**: the AWS CLI is not installed (step 1).
- **`Unable to resolve AWS account to use`** from `cdk bootstrap`/`deploy`:
  CDK found no credentials. Pass `--profile …`, and check that
  `aws sts get-caller-identity --profile <name>` works (step 2).
- **`Set "allowedOrigin" in infra/cdk.json`**: step 3.
- **`This stack uses assets, so the toolkit stack must be deployed`** or
  **`SSM parameter /cdk-bootstrap/… not found`**: bootstrap is missing in this
  region (step 5). The deployer's profile must use the same region as the
  bootstrap.
- **`cdk deploy` as `wuwo-blog-deployer` says it could not assume the deploy role**
  and falls back to the user's own credentials: bootstrap ran in another
  region, or the `wuwo-blog-cdk-deployer` policy is not attached (step 6).
- **The deploy fails with `… is not authorized to perform: <action>`** for a
  role named `cdk-hnb659fds-cfn-exec-role-…`: the execution policy lacks that
  action (for example after you added a new resource type to `infra/`). With
  admin access, add the action to `infra/policies/wuwo-blog-cdk-execution.json`
  and publish the new version:
  `aws iam create-policy-version --policy-arn arn:aws:iam::<account>:policy/wuwo-blog-cdk-execution --policy-document file://policies/wuwo-blog-cdk-execution.json --set-as-default`.
  CloudFormation rolls the failed change back by itself; deploy again.
- **`AccessDenied` from `npm run images:publish`**: `.env` points at the wrong
  profile, or the publisher policy is not attached (step 8). Check with
  `aws s3 ls s3://<bucket> --profile wuwo-blog-publisher`.
- **`Missing settings: …`**: `.env` is missing or incomplete. Copy
  `.env.example` and fill in the values from the CDK outputs.
- **`CLOUDFRONT_DOMAIN in .env … differs from images.cdnDomain`**: make the two
  values equal. The build only sees `src/site.config.ts`.
- **403 from CloudFront** for an image URL: the object does not exist under
  that key (CloudFront reports missing objects as 403 when the bucket is
  private), or the bucket policy no longer allows the distribution. Check the
  key in S3 and that the stack is deployed as-is. Right after a deploy, wait a
  few minutes for the distribution.
- **The pre-commit hook blocked a commit**: it printed the files. Run
  `npm run images:publish`, then stage the rewritten posts and
  `src/data/image-manifest.json`. Unstage image files with
  `git restore --staged <file>`. For one commit without the check:
  `SKIP_SIMPLE_GIT_HOOKS=1 git commit …`. GUI Git clients need `node` on their
  `PATH` for the hook to run.
- **CI fails with "unpublished post images"**: a post with a local reference
  was committed (for example with the hook skipped). Publish and push again.
- **HEIC cannot be decoded**: sharp's prebuilt binaries have no HEVC decoder.
  Convert first (`sips -s format jpeg photo.heic --out photo.jpg` on macOS) or
  install sharp against a libvips built with libheif.
- **Stale image attributes after a change to the manifest or to the plugin**:
  Astro caches rendered Markdown by the post's text (`.astro/` and
  `node_modules/.astro/data-store.json`). Touch the post, or run
  `npx astro build --force` / delete both folders before `npm run dev`.
- **Testing the script without AWS**: `IMAGES_LOCAL_STORE=/tmp/images-store
  CLOUDFRONT_DOMAIN=example.invalid npm run images:publish` writes the objects
  to that folder instead of S3. Useful for a dry run of the whole flow; the
  pages will not load the images until they exist on a real domain.

## Limits worth knowing

- Drafts are checked like any other post. Publish their images or keep the
  draft uncommitted.
- Raw HTML `<img>` in `.md` and JSX `<img>` in `.mdx` are rewritten to the URL
  but get no `width`/`height`/`srcset`. Use Markdown image syntax or `PostImage`.
- `import photo from './photo.jpg'` becomes `export const photo = 'https://…';`
  after publishing, so `photo.width` or `<Image src={photo}>` from
  `astro:assets` would break. The script refuses to publish such a post and
  says so; use `Figure` or `PostImage`.
- Links to image files (`[download](./full.jpg)`) are rewritten too, to the
  WebP version.
- The Open Graph image of a published post is the WebP URL. Most link
  previewers accept WebP; a few older ones do not.
- `images.sizes` is one value for the whole site; set it to match the active
  theme's text column.
