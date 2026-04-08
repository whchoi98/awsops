import * as cdk from 'aws-cdk-lib';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as iam from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';

export interface CognitoStackProps extends cdk.StackProps {
  /**
   * The CloudFront distribution to protect with Cognito authentication.
   * Lambda@Edge will be attached to viewer-request events.
   */
  distribution: cloudfront.Distribution;
  /**
   * Optional custom domain for the dashboard (e.g., 'awsops.example.com').
   * When set, Cognito callback URLs will use this domain instead of the CloudFront domain.
   */
  customDomain?: string;
}

export class CognitoStack extends cdk.Stack {
  public readonly userPool: cognito.UserPool;
  public readonly userPoolClient: cognito.UserPoolClient;
  public readonly userPoolDomain: cognito.UserPoolDomain;

  constructor(scope: Construct, id: string, props: CognitoStackProps) {
    super(scope, id, props);

    // -------------------------------------------------------
    // Cognito User Pool
    // -------------------------------------------------------
    // Callback domain: use custom domain if provided, otherwise CloudFront distribution domain
    const callbackDomain = props.customDomain || props.distribution.distributionDomainName;

    this.userPool = new cognito.UserPool(this, 'AWSopsUserPool', {
      userPoolName: 'awsops-user-pool',
      selfSignUpEnabled: false,
      signInAliases: { email: true, username: true },
      autoVerify: { email: true },
      passwordPolicy: {
        minLength: 8,
        requireLowercase: true,
        requireUppercase: true,
        requireDigits: true,
        requireSymbols: false,
      },
      accountRecovery: cognito.AccountRecovery.EMAIL_ONLY,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    // -------------------------------------------------------
    // Cognito Domain (Hosted UI)
    // -------------------------------------------------------
    this.userPoolDomain = this.userPool.addDomain('AWSopsDomain', {
      cognitoDomain: {
        domainPrefix: `awsops-${this.account}`,
      },
    });

    // -------------------------------------------------------
    // Cognito App Client
    // -------------------------------------------------------
    this.userPoolClient = this.userPool.addClient('AWSopsAppClient', {
      userPoolClientName: 'awsops-app-client',
      generateSecret: true,
      oAuth: {
        flows: { authorizationCodeGrant: true },
        scopes: [cognito.OAuthScope.OPENID, cognito.OAuthScope.EMAIL, cognito.OAuthScope.PROFILE],
        callbackUrls: [`https://${callbackDomain}/awsops/_callback`],
        logoutUrls: [`https://${callbackDomain}/awsops/`],
      },
      authFlows: {
        userPassword: true,
        userSrp: true,
      },
      accessTokenValidity: cdk.Duration.hours(1),
      idTokenValidity: cdk.Duration.hours(1),
      refreshTokenValidity: cdk.Duration.days(30),
    });

    // -------------------------------------------------------
    // Lambda@Edge for CloudFront Authentication
    // This function must be deployed in us-east-1 for Lambda@Edge.
    // It validates JWT tokens from the awsops_token cookie,
    // redirects unauthenticated users to Cognito Hosted UI,
    // and handles the OAuth2 callback to exchange code for tokens.
    // -------------------------------------------------------
    const edgeFunctionRole = new iam.Role(this, 'EdgeFunctionRole', {
      assumedBy: new iam.CompositePrincipal(
        new iam.ServicePrincipal('lambda.amazonaws.com'),
        new iam.ServicePrincipal('edgelambda.amazonaws.com'),
      ),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaBasicExecutionRole'),
      ],
    });

    const edgeFunction = new lambda.Function(this, 'AuthEdgeFunction', {
      functionName: 'awsops-auth-edge',
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: 'index.handler',
      role: edgeFunctionRole,
      code: lambda.Code.fromInline(`
'use strict';
const https = require('https');
const querystring = require('querystring');

// These values should be injected via environment or SSM in production.
// For Lambda@Edge, environment variables are NOT supported,
// so these are embedded at deploy time or fetched from a config endpoint.
const COGNITO_DOMAIN = process.env.COGNITO_DOMAIN || 'PLACEHOLDER_DOMAIN';
const CLIENT_ID = process.env.CLIENT_ID || 'PLACEHOLDER_CLIENT_ID';
const CLIENT_SECRET = process.env.CLIENT_SECRET || 'PLACEHOLDER_CLIENT_SECRET';
const CALLBACK_PATH = '/awsops/_callback';
const COOKIE_NAME = 'awsops_token';

exports.handler = async (event) => {
  const request = event.Records[0].cf.request;
  const headers = request.headers;
  const uri = request.uri;
  const host = headers.host[0].value;

  // Parse cookies
  const cookies = {};
  if (headers.cookie) {
    headers.cookie[0].value.split(';').forEach(c => {
      const [k, v] = c.trim().split('=');
      if (k && v) cookies[k] = v;
    });
  }

  // Handle OAuth callback
  if (uri === CALLBACK_PATH && request.querystring) {
    const params = querystring.parse(request.querystring);
    if (params.code) {
      try {
        const tokens = await exchangeCode(params.code, host);
        return {
          status: '302',
          statusDescription: 'Found',
          headers: {
            location: [{ key: 'Location', value: '/awsops' }],
            'set-cookie': [{
              key: 'Set-Cookie',
              value: COOKIE_NAME + '=' + tokens.id_token + '; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=3600'
            }],
          },
        };
      } catch (err) {
        console.error('Token exchange failed:', err);
      }
    }
  }

  // Check for valid token
  const token = cookies[COOKIE_NAME];
  if (token) {
    try {
      // Basic JWT structure validation (header.payload.signature)
      const parts = token.split('.');
      if (parts.length === 3) {
        const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString());
        if (payload.exp && payload.exp > Date.now() / 1000) {
          return request; // Token valid, pass through
        }
      }
    } catch (e) {
      // Invalid token, redirect to login
    }
  }

  // Redirect to Cognito Hosted UI
  const redirectUri = 'https://' + host + CALLBACK_PATH;
  const loginUrl = 'https://' + COGNITO_DOMAIN + '/login?' + querystring.stringify({
    response_type: 'code',
    client_id: CLIENT_ID,
    redirect_uri: redirectUri,
    scope: 'openid email profile',
  });

  return {
    status: '302',
    statusDescription: 'Found',
    headers: {
      location: [{ key: 'Location', value: loginUrl }],
    },
  };
};

function exchangeCode(code, host) {
  return new Promise((resolve, reject) => {
    const redirectUri = 'https://' + host + CALLBACK_PATH;
    const postData = querystring.stringify({
      grant_type: 'authorization_code',
      code: code,
      client_id: CLIENT_ID,
      redirect_uri: redirectUri,
    });
    const auth = Buffer.from(CLIENT_ID + ':' + CLIENT_SECRET).toString('base64');
    const options = {
      hostname: COGNITO_DOMAIN,
      path: '/oauth2/token',
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': 'Basic ' + auth,
        'Content-Length': Buffer.byteLength(postData),
      },
    };
    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', d => body += d);
      res.on('end', () => {
        if (res.statusCode === 200) resolve(JSON.parse(body));
        else reject(new Error('Token exchange failed: ' + res.statusCode + ' ' + body));
      });
    });
    req.on('error', reject);
    req.write(postData);
    req.end();
  });
}
      `),
      timeout: cdk.Duration.seconds(5),
      memorySize: 128,
      description: 'AWSops CloudFront auth - JWT validation and Cognito OAuth2 flow',
    });

    // Note: Attaching Lambda@Edge to an existing CloudFront distribution
    // requires creating a new cache behavior or updating via custom resource.
    // In practice, the Lambda@Edge version ARN is added to CloudFront behaviors
    // via the deployment scripts (05-setup-cognito.sh).
    // The CDK cross-stack reference stores the function ARN for the deployment script.

    // -------------------------------------------------------
    // Outputs
    // -------------------------------------------------------
    new cdk.CfnOutput(this, 'UserPoolId', {
      value: this.userPool.userPoolId,
      description: 'Cognito User Pool ID',
      exportName: 'AwsopsCognito-UserPoolId',
    });

    new cdk.CfnOutput(this, 'UserPoolClientId', {
      value: this.userPoolClient.userPoolClientId,
      description: 'Cognito App Client ID',
      exportName: 'AwsopsCognito-ClientId',
    });

    new cdk.CfnOutput(this, 'CognitoDomainUrl', {
      value: `https://${this.userPoolDomain.domainName}.auth.${this.region}.amazoncognito.com`,
      description: 'Cognito Hosted UI Domain URL',
      exportName: 'AwsopsCognito-DomainUrl',
    });

    new cdk.CfnOutput(this, 'EdgeFunctionArn', {
      value: edgeFunction.functionArn,
      description: 'Lambda@Edge function ARN for CloudFront viewer-request',
      exportName: 'AwsopsCognito-EdgeFunctionArn',
    });
  }
}
