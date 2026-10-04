/** Storage-backed tests need TEST_S3_* (CI provides SeaweedFS); they are skipped otherwise. */
export const hasS3 = Boolean(process.env.TEST_S3_ENDPOINT);
