'use server';

import { createAdminClient } from '../supabase/server';
import { cookies } from 'next/headers';
import { encryptId, extractCustomerIdFromUrl, parseStringify } from '../utils';
import { CountryCode, ProcessorTokenCreateRequest, ProcessorTokenCreateRequestProcessorEnum, Products } from 'plaid';

import { plaidClient } from '@/lib/plaid';
import { revalidatePath } from 'next/cache';
import { addFundingSource, createDwollaCustomer } from './dwolla.actions';

export const getUserInfo = async ({ userId }: getUserInfoProps) => {
  try {
    const supabase = await createAdminClient();

    // Query by auth_id (the Supabase auth user ID)
    const { data: user, error } = await supabase
      .from('users')
      .select('*')
      .eq('auth_id', userId)
      .single();

    if (error || !user) {
      console.error('Error fetching user:', error);
      return null;
    }

    return parseStringify(user);
  } catch (error) {
    console.log('Error in getUserInfo:', error);
    return null;
  }
};

export const signIn = async ({ email, password }: signInProps) => {
  try {
    const supabase = await createAdminClient();

    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error || !data.user) {
      console.error('Sign in error:', error);
      throw error;
    }

    const user = await getUserInfo({ userId: data.user.id });

    return parseStringify(user);
  } catch (error) {
    console.error('Error in signIn:', error);
    return null;
  }
};

export const signUp = async ({ password, ...userData }: SignUpParams) => {
  const { email, firstName, lastName } = userData;

  try {
    const supabase = await createAdminClient();

    // Create auth user
    const { data: authData, error: authError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          first_name: firstName,
          last_name: lastName,
        },
      },
    });

    if (authError || !authData.user) {
      console.error('Auth error:', authError);
      throw authError;
    }

    // Create Dwolla customer
    const dwollaCustomerUrl = await createDwollaCustomer({
      ...userData,
      type: 'personal',
    });

    if (!dwollaCustomerUrl) {
      throw new Error('Error creating Dwolla customer');
    }

    const dwollaCustomerId = extractCustomerIdFromUrl(dwollaCustomerUrl);

    // Insert user record in public.users table (use upsert to handle both create and update)
    const { data: newUser, error: userError } = await supabase
      .from('users')
      .upsert({
        auth_id: authData.user.id,
        email: email,
        user_id: authData.user.id,
        first_name: firstName,
        last_name: lastName,
        address1: userData.address1,
        city: userData.city,
        state: userData.state,
        postal_code: userData.postalCode,
        date_of_birth: userData.dateOfBirth,
        ssn: userData.ssn,
        dwolla_customer_url: dwollaCustomerUrl,
        dwolla_customer_id: dwollaCustomerId,
      }, {
        onConflict: 'auth_id',
      })
      .select()
      .single();

    if (userError || !newUser) {
      console.error('User upsert error:', userError);
      throw userError;
    }

    return parseStringify(newUser);
  } catch (error) {
    console.error('Error in signUp:', error);
    return null;
  }
};

export async function getLoggedInUser() {
  try {
    const supabase = await createAdminClient();

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      console.log('No authenticated user:', authError);
      return null;
    }

    const userInfo = await getUserInfo({ userId: user.id });

    return parseStringify(userInfo);
  } catch (error) {
    console.log('Error in getLoggedInUser:', error);
    return null;
  }
}

export const logoutAccount = async () => {
  try {
    const supabase = await createAdminClient();

    await supabase.auth.signOut();
  } catch (error) {
    console.error('Error in logoutAccount:', error);
    return null;
  }
};

export const createLinkToken = async (user: User) => {
  try {
    const tokenParams = {
      user: {
        client_user_id: user.user_id,
      },
      client_name: `${user.first_name} ${user.last_name}`,
      products: ['auth'] as Products[],
      language: 'en',
      country_codes: ['US'] as CountryCode[],
    };

    const response = await plaidClient.linkTokenCreate(tokenParams);

    return parseStringify({ linkToken: response.data.link_token });
  } catch (error) {
    console.log('Error in createLinkToken:', error);
    return null;
  }
};

export const createBankAccount = async ({
  userId,
  bankId,
  accountId,
  accessToken,
  fundingSourceUrl,
  shareableId,
}: createBankAccountProps) => {
  try {
    const supabase = await createAdminClient();

    const { data: bankAccount, error } = await supabase
      .from('banks')
      .insert({
        user_id: userId,
        account_id: accountId,
        bank_id: bankId,
        access_token: accessToken,
        funding_source_url: fundingSourceUrl,
        shareable_id: shareableId,
      })
      .select()
      .single();

    if (error || !bankAccount) {
      console.error('Error creating bank account:', error);
      throw error;
    }

    return parseStringify(bankAccount);
  } catch (error) {
    console.log('Error in createBankAccount:', error);
    return null;
  }
};

export const exchangePublicToken = async ({
  publicToken,
  user,
}: exchangePublicTokenProps) => {
  try {
    // Exchange public token for access token and item ID
    const response = await plaidClient.itemPublicTokenExchange({
      public_token: publicToken,
    });

    const accessToken = response.data.access_token;
    const itemId = response.data.item_id;

    // Get account information from Plaid using the access token
    const accountsResponse = await plaidClient.accountsGet({
      access_token: accessToken,
    });

    const accountData = accountsResponse.data.accounts[0];

    // Create a processor token for Dwolla using the access token and account ID
    const request: ProcessorTokenCreateRequest = {
      access_token: accessToken,
      account_id: accountData.account_id,
      processor: 'dwolla' as ProcessorTokenCreateRequestProcessorEnum,
    };

    const processorTokenResponse = await plaidClient.processorTokenCreate(request);
    const processorToken = processorTokenResponse.data.processor_token;

    // Create a funding source URL for the account using the Dwolla customer ID, processor token, and bank name
    const fundingSourceUrl = await addFundingSource({
      dwollaCustomerId: user.dwollaCustomerId,
      processorToken,
      bankName: accountData.name,
    });

    // If the funding source URL is not created, throw an error
    if (!fundingSourceUrl) throw new Error('Failed to create funding source');

    // Create a bank account using the user ID, item ID, account ID, access token, funding source URL, and shareableId ID
    await createBankAccount({
      userId: user.user_id,
      bankId: itemId,
      accountId: accountData.account_id,
      accessToken,
      fundingSourceUrl,
      shareableId: encryptId(accountData.account_id),
    });

    // Revalidate the path to reflect the changes
    revalidatePath('/');

    // Return a success message
    return parseStringify({
      publicTokenExchange: 'complete',
    });
  } catch (error) {
    console.error('An error occurred while creating exchanging token:', error);
    return null;
  }
};

export const getBanks = async ({ userId }: getBanksProps) => {
  try {
    const supabase = await createAdminClient();

    const { data: banks, error } = await supabase
      .from('banks')
      .select('*')
      .eq('user_id', userId);

    if (error) {
      console.log('Error fetching banks:', error);
      return [];
    }

    return parseStringify(banks);
  } catch (error) {
    console.log('Error in getBanks:', error);
    return [];
  }
};

export const getBank = async ({ documentId }: getBankProps) => {
  try {
    const supabase = await createAdminClient();

    const { data: bank, error } = await supabase
      .from('banks')
      .select('*')
      .eq('id', documentId)
      .single();

    if (error || !bank) {
      console.log('Error fetching bank:', error);
      return null;
    }

    return parseStringify(bank);
  } catch (error) {
    console.log('Error in getBank:', error);
    return null;
  }
};

export const getBankByAccountId = async ({ accountId }: getBankByAccountIdProps) => {
  try {
    const supabase = await createAdminClient();

    const { data: banks, error } = await supabase
      .from('banks')
      .select('*')
      .eq('account_id', accountId)
      .limit(1);

    if (error || !banks || banks.length !== 1) {
      console.log('Error fetching bank by account ID:', error);
      return null;
    }

    return parseStringify(banks[0]);
  } catch (error) {
    console.log('Error in getBankByAccountId:', error);
    return null;
  }
};
