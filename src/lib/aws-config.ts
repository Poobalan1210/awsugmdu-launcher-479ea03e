import { Amplify } from 'aws-amplify';

Amplify.configure({
  Auth: {
    Cognito: {
      userPoolId: import.meta.env.VITE_COGNITO_USER_POOL_ID,
      userPoolClientId: import.meta.env.VITE_COGNITO_CLIENT_ID,
      region: import.meta.env.VITE_AWS_REGION,
      loginWith: {
        email: true,
      },
    }
  },
  Storage: {
    S3: {
      bucket: import.meta.env.VITE_S3_BUCKET_NAME,
      region: import.meta.env.VITE_AWS_REGION,
    }
  }
});
