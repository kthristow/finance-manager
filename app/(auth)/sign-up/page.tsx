import AuthForm from '@/components/AuthForm'
import { getLoggedInUser } from '@/lib/actions/user.action';
import React from 'react'

const SignUp = () => {
  return (
    <section className='flex-center size-full mas-sm:px-6'>
      <AuthForm type="sign-up"/>
    </section>
  )
}

export default SignUp