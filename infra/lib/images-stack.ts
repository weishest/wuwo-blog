/**
 * Blog images on AWS:
 *   - a private, versioned S3 bucket (Block Public Access on, SSL enforced)
 *   - a CloudFront distribution reading it through Origin Access Control:
 *     HTTPS only, HTTP/2 + HTTP/3, compression, a cache policy that respects
 *     the long Cache-Control headers the publish script sets, CORS for the
 *     blog's origin, optional custom domain
 *   - a bucket policy that lets only this distribution read objects
 *   - an IAM managed policy for the publishing user / SSO permission set:
 *     PutObject, GetObject, ListBucket on this bucket, and nothing else
 */
import { CfnOutput, Duration, RemovalPolicy, Stack, type StackProps } from 'aws-cdk-lib';
import * as acm from 'aws-cdk-lib/aws-certificatemanager';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as s3 from 'aws-cdk-lib/aws-s3';
import type { Construct } from 'constructs';

/**
 * Names of the bucket and the IAM policy start with this. The CloudFormation
 * execution policy (policies/wuwo-blog-cdk-execution.json) is scoped to it.
 */
export const RESOURCE_PREFIX = 'wuwo-blog-images-';

export interface ImagesStackProps extends StackProps {
  /** The site that embeds the images, e.g. https://<user>.github.io (CORS). */
  allowedOrigin: string;
  /** Custom domain for the distribution. Needs `certificateArn`. */
  domainName?: string | undefined;
  /** ACM certificate for `domainName`; CloudFront requires it in us-east-1. */
  certificateArn?: string | undefined;
  /** Name of the publisher managed policy (referenced by name from Identity Center). */
  policyName?: string | undefined;
}

export class ImagesStack extends Stack {
  constructor(scope: Construct, id: string, props: ImagesStackProps) {
    super(scope, id, props);

    const bucket = new s3.Bucket(this, 'Bucket', {
      // Fixed `wuwo-blog-images-` prefix: policies/wuwo-blog-cdk-execution.json only
      // allows CloudFormation to manage buckets with this prefix.
      bucketName: `${RESOURCE_PREFIX}${this.account}-${this.region}`,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      versioned: true,
      enforceSSL: true,
      encryption: s3.BucketEncryption.S3_MANAGED,
      // Keep the images if the stack is ever deleted.
      removalPolicy: RemovalPolicy.RETAIN,
      // Objects are immutable (content-hashed names), so old versions only
      // matter for undoing an accidental overwrite.
      lifecycleRules: [{ noncurrentVersionExpiration: Duration.days(90) }],
      // Browsers see the CORS headers that CloudFront adds (response headers
      // policy below); CloudFront's cache policy does not forward `Origin`
      // to S3. This rule covers direct, signed access to the bucket.
      cors: [
        {
          allowedMethods: [s3.HttpMethods.GET, s3.HttpMethods.HEAD],
          allowedOrigins: [props.allowedOrigin],
          allowedHeaders: ['*'],
          maxAge: 3000,
        },
      ],
    });

    const responseHeaders = new cloudfront.ResponseHeadersPolicy(this, 'ResponseHeaders', {
      comment: 'CORS for wuwo.blog images',
      corsBehavior: {
        accessControlAllowCredentials: false,
        accessControlAllowHeaders: ['*'],
        accessControlAllowMethods: ['GET', 'HEAD'],
        accessControlAllowOrigins: [props.allowedOrigin],
        accessControlMaxAge: Duration.seconds(3000),
        originOverride: true,
      },
    });

    const certificate = props.certificateArn ? acm.Certificate.fromCertificateArn(this, 'Certificate', props.certificateArn) : undefined;

    const distribution = new cloudfront.Distribution(this, 'Distribution', {
      comment: 'wuwo.blog images',
      defaultBehavior: {
        // OAC: CloudFront signs its requests; CDK adds the bucket policy that
        // allows s3:GetObject only for this distribution's ARN.
        origin: origins.S3BucketOrigin.withOriginAccessControl(bucket, {
          originAccessLevels: [cloudfront.AccessLevel.READ],
        }),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.HTTPS_ONLY,
        allowedMethods: cloudfront.AllowedMethods.ALLOW_GET_HEAD,
        cachedMethods: cloudfront.CachedMethods.CACHE_GET_HEAD,
        // Honours the origin's Cache-Control (max-age=31536000, immutable).
        cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
        responseHeadersPolicy: responseHeaders,
        compress: true,
      },
      httpVersion: cloudfront.HttpVersion.HTTP2_AND_3,
      ...(props.domainName && certificate
        ? {
            domainNames: [props.domainName],
            certificate,
            minimumProtocolVersion: cloudfront.SecurityPolicyProtocol.TLS_V1_2_2021,
          }
        : {}),
    });

    const policy = new iam.ManagedPolicy(this, 'PublisherPolicy', {
      managedPolicyName: props.policyName ?? 'wuwo-blog-images-publisher',
      description: 'Publish blog images: put/get objects and list the images bucket. No delete.',
      statements: [
        new iam.PolicyStatement({
          sid: 'Objects',
          actions: ['s3:PutObject', 's3:GetObject'],
          resources: [bucket.arnForObjects('*')],
        }),
        new iam.PolicyStatement({
          sid: 'List',
          actions: ['s3:ListBucket'],
          resources: [bucket.bucketArn],
        }),
      ],
    });

    new CfnOutput(this, 'BucketName', { value: bucket.bucketName, description: 'S3_BUCKET for .env' });
    new CfnOutput(this, 'ImagesDomain', {
      value: props.domainName ?? distribution.distributionDomainName,
      description: 'CLOUDFRONT_DOMAIN for .env and images.cdnDomain in src/site.config.ts',
    });
    new CfnOutput(this, 'DistributionId', { value: distribution.distributionId });
    new CfnOutput(this, 'PublisherPolicyArn', { value: policy.managedPolicyArn, description: 'Attach to the IAM user' });
    new CfnOutput(this, 'PublisherPolicyName', {
      value: policy.managedPolicyName,
      description: 'Customer managed policy name for an Identity Center permission set',
    });
  }
}
