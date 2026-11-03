# infra: AWS resources for post images

An AWS CDK v2 app (TypeScript) that creates what `npm run images:publish` needs:

- a private S3 bucket (Block Public Access, versioning, SSL enforced)
- a CloudFront distribution reading it through Origin Access Control
  (HTTPS only, HTTP/2 + HTTP/3, compression, long caching, CORS for the blog)
- a bucket policy that allows only that distribution to read
- the `wuwo-blog-images-publisher` IAM managed policy (PutObject, GetObject,
  ListBucket on this bucket; no delete)

Settings live in `cdk.json` (`allowedOrigin`, optional `domainName` +
`certificateArn` in us-east-1).

Least privilege: an admin profile is used only once, to create the two
policies in `policies/` and to bootstrap with
`--cloudformation-execution-policies arn:aws:iam::<account>:policy/wuwo-blog-cdk-execution`
(CloudFormation then manages only `wuwo-blog-images-*` buckets and policies, and
CloudFront). Deploys run as a user with `policies/wuwo-blog-cdk-deployer.json`,
which can only assume CDK's bootstrap roles:

```sh
npm install
npx cdk deploy --profile wuwo-blog-deployer
```

`npm run build` type-checks; `npx cdk synth` writes the
CloudFormation template to `cdk.out/` without touching AWS. The app runs with
plain Node (`node bin/images.ts`), so there is no ts-node.

The outputs (`BucketName`, `ImagesDomain`, `PublisherPolicyArn`,
`PublisherPolicyName`) feed `.env` and `src/site.config.ts`. The full setup
(AWS CLI, the three IAM users, the exact commands) and the writing workflow are in [../docs/IMAGES.md](../docs/IMAGES.md).
